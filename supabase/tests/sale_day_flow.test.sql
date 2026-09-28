-- End-to-end check of the money and stock rules (pgTAP).
-- Run with: supabase test db
begin;
select plan(40);

-- The seed fills the database for local development. These tests describe
-- behaviour from an empty start, so clear it inside the transaction.
set local client_min_messages = warning;
truncate table auth.users, public.items cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, target_sale_days = 2,
       over_short_ok_cents = 300, over_short_warn_cents = 1000, gst_rate = 0.05,
       max_items_per_kid = 3, max_treats_per_kid = 1, treasurer_email = null;

-- People ----------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'treasurer@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@example.com');
-- The first sign-in on an empty database becomes the coordinator (ADR-0011),
-- so Calvin already has a profile by the time we get here.
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer'),
  ('00000000-0000-0000-0000-00000000000c', 'Treasurer', 'treasurer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

-- Buying ----------------------------------------------------------------------
select lives_ok($$
  select public.log_purchase('{
    "id": "10000000-0000-0000-0000-000000000001",
    "purchased_on": "2026-09-26", "store": "Costco",
    "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/costco-0926.jpg",
    "lines": [
      {"new_item": {"name": "Nestlé mini bars, assorted", "type": "treat"}, "pieces": 130, "cost_cents": 1799, "price_cents": 100, "bundle_size": 2},
      {"new_item": {"name": "Chips, assorted", "type": "snack"}, "pieces": 30, "cost_cents": 1560, "price_cents": 100},
      {"new_item": {"name": "Rice crackers", "type": "snack"}, "pieces": 50, "cost_cents": 1499}
    ]}'::jsonb)
$$, 'volunteer logs a receipt with three new items');

select is((select count(*)::int from public.purchases), 1, 'one claim created');
select lives_ok($$
  select public.log_purchase('{
    "id": "10000000-0000-0000-0000-000000000001", "purchased_on": "2026-09-26", "store": "Costco",
    "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/x.jpg",
    "lines": [{"new_item": {"name": "dup", "type": "snack"}, "pieces": 1, "cost_cents": 1}]}'::jsonb)
$$, 'retrying the same purchase id is harmless');
select is((select count(*)::int from public.purchases), 1, 'retry did not duplicate the claim');
select is((select on_hand from public.item_stock where name = 'Nestlé mini bars, assorted'), 130, 'mini bars stocked in pieces');
select is((select unit_cost_cents from public.items where name = 'Nestlé mini bars, assorted'), 13.84::numeric(10,2), 'cost per piece 13.84¢');
select is((select (price_cents, bundle_size)::text from public.items where name = 'Nestlé mini bars, assorted'), '(100,2)', 'priced 2 for $1');
select is((select price_cents from public.items where name = 'Rice crackers'), null::int, 'rice crackers wait for a price');
select is((select status::text from public.claims), 'to_pay', 'claim is To pay');
select is((select total_cents from public.claims), 4858, 'claim total $48.58');
select is((select claim_label from public.claims), 'SS-001', 'claim label');

-- Weighted average cost: 30 chips at 52¢ + 30 more at 60¢ = 56¢
select lives_ok($$
  select public.log_purchase(jsonb_build_object(
    'purchased_on', '2026-09-27', 'store', 'Superstore',
    'buyer_id', '00000000-0000-0000-0000-00000000000a', 'receipt_path', 'r/ss.jpg',
    'lines', jsonb_build_array(jsonb_build_object(
      'item_id', (select id from public.items where name = 'Chips, assorted'),
      'pieces', 30, 'cost_cents', 1800))))
$$, 'second purchase of chips');
select is((select unit_cost_cents from public.items where name = 'Chips, assorted'), 56.00::numeric(10,2), 'weighted average cost');

select throws_like($$ insert into public.purchases (purchased_on, store, buyer_id, receipt_path)
  values ('2026-09-27', 'x', '00000000-0000-0000-0000-00000000000b', 'x') $$,
  '%row-level security%', 'claims can only be created through log_purchase()');

-- Sale day: lineup and check stock --------------------------------------------
select lives_ok($$ select public.create_sale_day('2026-09-29') $$, 'create sale day');
select is((select count(*)::int from public.sale_day_items), 2, 'suggested lineup has the two priced items');
select throws_like($$ select public.create_sale_day('2026-09-30') $$, '%duplicate key%', 'only one open sale day');
select throws_like($$ insert into public.sale_day_items (sale_day_id, item_id)
  select (select id from public.sale_days), id from public.items where name = 'Rice crackers' $$,
  '%Only priced, active items%', 'unpriced items cannot join a lineup');

-- 2 mini bars missing at the box check
update public.sale_day_items set check_count = 128, check_reason = 'missing'
 where item_id = (select id from public.items where name = 'Nestlé mini bars, assorted');
select lives_ok($$ select public.start_sale((select id from public.sale_days)) $$, 'start sale');
select is((select on_hand from public.item_stock where name = 'Nestlé mini bars, assorted'), 128, 'missing bars recorded before selling');
select is((select start_count from public.sale_day_items sdi join public.items i on i.id = sdi.item_id where i.name = 'Chips, assorted'), 60, 'chips start at 60');

-- Price change mid-sale doesn't affect today
update public.items set price_cents = 200, bundle_size = 1 where name = 'Chips, assorted';
select is((select locked_price_cents from public.sale_day_items sdi join public.items i on i.id = sdi.item_id where i.name = 'Chips, assorted'), 100, 'today''s price stays locked');
select throws_like($$ update public.sale_day_items set left_count = 1 $$, '%during count-up%', 'no leftover counts while selling');

-- Count up ---------------------------------------------------------------------
select lives_ok($$ select public.begin_count((select id from public.sale_days)) $$, 'begin count-up');
update public.sale_day_items set left_count = 104, out_count = 0
 where item_id = (select id from public.items where name = 'Nestlé mini bars, assorted');   -- 24 pieces = 12 deals
update public.sale_day_items set left_count = 38, out_count = 2
 where item_id = (select id from public.items where name = 'Chips, assorted');             -- 20 sold, 2 out
update public.sale_days set helper_credits = 1;
update public.cash_counts set qty = 1 where denom_cents = 2000;
update public.cash_counts set qty = 5 where denom_cents = 500;
update public.cash_counts set qty = 8 where denom_cents = 200;
update public.cash_counts set qty = 12 where denom_cents = 100;
update public.cash_counts set qty = 4 where denom_cents = 25;

-- sales = 12 deals × $1 + 20 × $1 = $32; expected = 30 + 32 − 1 = $61; counted = 20+25+16+12+1 = $74
select is((select sales_cents from public.sale_day_totals), 3200, 'sales from stock counts');
select is((select expected_cents from public.sale_day_totals), 6100, 'expected cash = float + sales − helper credit');
select is((select over_short_cents from public.sale_day_totals), 1300, 'over by $13');

select throws_like($$ select public.close_sale_day((select id from public.sale_days)) $$, '%Two different volunteers%', 'needs two sign-offs');
select public.sign_off((select id from public.sale_days));
select public.sign_off((select id from public.sale_days));
select is((select signoffs from public.sale_day_totals), 1, 'same person twice counts once');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.sign_off((select id from public.sale_days));
update public.cash_counts set qty = 0 where denom_cents = 2000;   -- recount: that $20 was a mistake
select is((select signoffs from public.sale_day_totals), 0, 'changing a count clears sign-offs');
select is((select over_short_cents from public.sale_day_totals), -700, 'now short by $7');
select public.sign_off((select id from public.sale_days));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.sign_off((select id from public.sale_days));
select lives_ok($$ select public.close_sale_day((select id from public.sale_days)) $$, 'finish count-up');
select is((select on_hand from public.item_stock where name = 'Chips, assorted'), 38, 'chips stock after sale and out');
select throws_like($$ update public.cash_counts set qty = 99 where denom_cents = 5 $$, '%during count-up%', 'closed sale day is locked');
select throws_like($$ insert into public.stock_movements (item_id, qty, reason)
  select id, -1, 'sold' from public.items limit 1 $$, '%row-level security%', 'clients cannot post sales directly');

-- Treasurer link ---------------------------------------------------------------
reset role;
set local role service_role;
select throws_like($$ update public.stock_movements set qty = 1 $$, '%cannot be changed%', 'ledger is append-only, even for the service role');
create temp table tok on commit drop as select * from public.issue_mark_paid_tokens();
select is((select count(*)::int from tok), 2, 'one link per volunteer owed');
select lives_ok($$ select public.redeem_action_token((select token from tok where buyer_name = 'Yuki')) $$, 'treasurer marks Yuki paid');
select is((select paid_by from public.purchases where claim_no = 1), '00000000-0000-0000-0000-00000000000c'::uuid, 'payment recorded as the treasurer');
select throws_like($$ select public.redeem_action_token((select token from tok where buyer_name = 'Yuki')) $$, '%already been used%', 'links are single use');

select * from finish();
rollback;
