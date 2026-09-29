-- The change float counted at Check stock (ADR-0003 amended, pgTAP).
-- Run with: supabase test db
begin;
select plan(10);

-- The seed fills the database for local development. These tests describe
-- behaviour from an empty start, so clear it inside the transaction.
set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, target_sale_days = 2,
       over_short_ok_cents = 300, over_short_warn_cents = 1000, gst_rate = 0.05,
       max_items_per_kid = 3, max_treats_per_kid = 1, treasurer_email = null;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com');
insert into public.profiles (id, display_name, role)
values ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);

-- Four snacks and two treats, all priced except the rice crackers. The
-- popcorn is bought at 45¢ a piece and sold at $1, so its margin is 55%.
select public.log_purchase('{
  "purchased_on": "2026-09-26", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000a", "receipt_path": "r/costco.jpg",
  "lines": [
    {"new_item": {"name": "Popcorn", "type": "snack"}, "pieces": 40, "cost_cents": 1800, "price_cents": 100}
  ]}'::jsonb);


create function pg_temp.new_day(p_date date) returns void language sql as $f$
  select public.create_sale_day(p_date);
  insert into public.sale_day_items (sale_day_id, item_id)
  select (select id from public.sale_days where phase = 'lineup'), id from public.items where name = 'Popcorn'
  on conflict do nothing;
$f$;

select pg_temp.new_day('2026-09-29');
select throws_like($$ select public.start_sale((select id from public.sale_days), -100) $$,
  '%cannot be negative%', 'a negative float is refused');
select is((select phase::text from public.sale_days), 'lineup', 'a refused start leaves the sale day in the lineup');

select public.start_sale((select id from public.sale_days));
select is((select float_cents from public.sale_days), 3000, 'no amount keeps the float from Settings');

-- Second sale day: the counted float wins.
reset role;
truncate table public.sale_days cascade;
-- The cascade clears the ledger too, so put the popcorn back.
insert into public.stock_movements (item_id, qty, reason)
select id, 40, 'found' from public.items where name = 'Popcorn';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);

select pg_temp.new_day('2026-10-06');
select public.start_sale((select id from public.sale_days), 2500);
select is((select float_cents from public.sale_days), 2500, 'the counted float becomes the day''s float');
select is(
  (select (old_data ->> 'float_cents') || '→' || (new_data ->> 'float_cents')
     from public.audit_log
    where table_name = 'sale_days' and action = 'UPDATE'
      and (new_data ->> 'float_cents')::int = 2500),
  '3000→2500',
  'the audit log records the old and new float');
select is((select float_cents from public.settings), 3000, 'the Settings default is untouched');
select is((select float_cents from public.sale_day_lineup_totals), 2500, 'the header reads the counted float');

select public.begin_count((select id from public.sale_days));
update public.sale_day_items set left_count = 30, out_count = 0;
update public.cash_counts set qty = 1 where denom_cents = 2000;
update public.cash_counts set qty = 1 where denom_cents = 500;
update public.cash_counts set qty = 10 where denom_cents = 100;
select is((select expected_cents from public.sale_day_totals), 3500,
  'expected cash starts from the counted float (25 + 10 sold)');
select is((select deposit_cents from public.sale_day_totals), 1000,
  'the deposit is counted (35) minus the counted float (25)');
select is((select over_short_cents from public.sale_day_totals), 0, 'over/short follows the counted float');

select * from finish();
rollback;
