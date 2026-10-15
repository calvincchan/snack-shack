-- End-to-end check of the money and stock rules (pgTAP).
-- Run with: supabase test db
begin;
select plan(45);

-- The seed fills the database for local development. These tests describe
-- behaviour from an empty start, so clear it inside the transaction.
set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, gst_rate = 0.05, treasurer_email = null;

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
    'buyer_id', '00000000-0000-0000-0000-00000000000b', 'receipt_path', 'r/ss.jpg',
    'lines', jsonb_build_array(jsonb_build_object(
      'item_id', (select id from public.items where name = 'Chips, assorted'),
      'pieces', 30, 'cost_cents', 1800))))
$$, 'second purchase of chips');
select is((select unit_cost_cents from public.items where name = 'Chips, assorted'), 56.00::numeric(10,2), 'weighted average cost');

select throws_like($$ insert into public.purchases (purchased_on, store, buyer_id, receipt_path)
  values ('2026-09-27', 'x', '00000000-0000-0000-0000-00000000000b', 'x') $$,
  '%row-level security%', 'claims can only be created through log_purchase()');

-- Sale day: open count (ADR-0015) ----------------------------------------------
create temp table chips_before as select on_hand from public.item_stock where name = 'Chips, assorted';
select throws_like($$ select public.open_sale_day(public.local_today() + 1) $$, '%future%', 'no sale day in the future');
select lives_ok($$ select public.open_sale_day('2026-09-29') $$, 'open a backdated sale day');
select is((select count(*)::int from public.cash_counts), 16, 'eight open and eight close rows');
select throws_like($$ select public.open_sale_day('2026-09-30') $$, '%still open%', 'only one open sale day');
select throws_like($$ select public.start_selling((select id from public.sale_days)) $$, '%Count the cash box%', 'selling needs an open count');
select throws_like($$ update public.cash_counts set qty = 3 where kind = 'close' and denom_cents = 2000 $$,
  '%open count first%', 'no close count before selling');

-- The box opens with $28: $2 less than nothing expected yet (first sale day).
update public.cash_counts set qty = 1 where kind = 'open' and denom_cents = 2000;
update public.cash_counts set qty = 4 where kind = 'open' and denom_cents = 200;
select is((select open_cents from public.sale_day_cash), 2800, 'open count from the denominations');
select is((select expected_open_cents from public.sale_day_cash), null::int, 'nothing to compare the first sale day with');
select lives_ok($$ select public.start_selling((select id from public.sale_days), '  ') $$, 'start selling');
select is((select open_note from public.sale_days), null, 'a blank note is no note');
select throws_like($$ update public.cash_counts set qty = 9 where kind = 'open' and denom_cents = 100 $$,
  '%open count can''t change%', 'the open count locks once selling starts');
select throws_like($$ select public.start_selling((select id from public.sale_days)) $$, '%already started%', 'start selling once');
select throws_like($$ select public.cancel_sale_day((select id from public.sale_days)) $$, '%can''t be cancelled%', 'no cancelling after selling starts');

-- Close count -------------------------------------------------------------------
update public.cash_counts set qty = 3 where kind = 'close' and denom_cents = 2000;
update public.cash_counts set qty = 2 where kind = 'close' and denom_cents = 1000;
update public.cash_counts set qty = 12 where kind = 'close' and denom_cents = 200;
update public.cash_counts set qty = 9 where kind = 'close' and denom_cents = 100;
update public.cash_counts set qty = 4 where kind = 'close' and denom_cents = 25;
-- close = 60 + 20 + 24 + 9 + 1 = $114; revenue = 114 − 28 = $86
select is((select close_cents from public.sale_day_cash), 11400, 'close count from the denominations');
select is((select revenue_cents from public.sale_day_cash), 8600, 'revenue = close − open');
select throws_like($$ select public.close_sale_day((select id from public.sale_days), 20000) $$,
  '%more than you counted%', 'left in box can''t exceed the close count');
select throws_like($$ select public.close_sale_day((select id from public.sale_days), -1) $$,
  '%negative%', 'left in box can''t be negative');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.close_sale_day((select id from public.sale_days), 3000, 'Gummies went first.') $$, 'close the sale day');
select is((select deposit_cents from public.sale_day_cash), 8400, 'deposit = close − left in box');
select is((select closed_by_name from public.sale_day_cash), 'Calvin', 'whoever closes it is the sign-off');
select throws_like($$ select public.close_sale_day((select id from public.sale_days), 3000) $$, '%already closed%', 'close once');
select throws_like($$ update public.cash_counts set qty = 99 where kind = 'close' and denom_cents = 5 $$,
  '%closed%', 'a closed sale day is locked');
select is((select on_hand from public.item_stock where name = 'Chips, assorted'), (select on_hand from chips_before),
  'a sale day doesn''t touch stock');

-- Next sale day: the box should open with what was left last time.
select public.open_sale_day('2026-09-30');
update public.cash_counts set qty = 25 where kind = 'open' and denom_cents = 100
 and sale_day_id = (select id from public.sale_days where sale_date = '2026-09-30');
select is((select expected_open_cents from public.sale_day_cash where sale_date = '2026-09-30'), 3000,
  'expected open is the last left in box');
select is((select open_diff_cents from public.sale_day_cash where sale_date = '2026-09-30'), -500,
  'the open count is $5 short of it');
select throws_like($$ select public.open_sale_day('2026-09-29') $$, '%still open%', 'still one open at a time');
select lives_ok($$ select public.cancel_sale_day((select id from public.sale_days where sale_date = '2026-09-30')) $$,
  'a sale day opened by mistake can be cancelled before selling');
select throws_like($$ select public.open_sale_day('2026-09-29') $$, '%already a sale day on Sep 29%', 'one sale day per date');
update public.sale_days set phase = 'open';   -- no update policy: changes nothing
select is((select phase::text from public.sale_days), 'closed', 'and it stays closed');
select throws_like($$ insert into public.stock_movements (item_id, qty, reason)
  select id, -1, 'sold' from public.items limit 1 $$, '%row-level security%', 'clients cannot post sales directly');

-- Ledger ------------------------------------------------------------------------
reset role;
set local role service_role;
select throws_like($$ update public.stock_movements set qty = 1 $$, '%cannot be changed%', 'ledger is append-only, even for the service role');

select * from finish();
rollback;
