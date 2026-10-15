-- What the weekly treasurer email is built from (pgTAP).
-- Run with: supabase test db
begin;
select plan(15);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, gst_rate = 0.05, treasurer_email = null;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'treasurer@example.com');
insert into public.profiles (id, display_name, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'Chun Yu Chan', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', null, 'volunteer'),
  ('00000000-0000-0000-0000-00000000000d', 'Treasurer', null, 'treasurer')
on conflict (id) do update
  set display_name = excluded.display_name, full_name = excluded.full_name, role = excluded.role;

-- A closed sale day with the given open and close totals, left in box $30.
create function pg_temp.cash_day(p_date date, p_open int, p_close int) returns void
language plpgsql security definer as $fn$
declare
  v_day uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
  v_day := public.open_sale_day(p_date);
  perform set_config('snack.fn', 'on', true);
  update public.cash_counts set qty = p_open / 100 where sale_day_id = v_day and kind = 'open' and denom_cents = 100;
  update public.cash_counts set qty = p_close / 100 where sale_day_id = v_day and kind = 'close' and denom_cents = 100;
  perform set_config('snack.fn', '', true);
  perform public.start_selling(v_day);
  perform public.close_sale_day(v_day, 3000);
end $fn$;

select is(public.treasurer_report_week('2026-09-28 14:00:00+00'), '2026-09-21'::date,
  'Monday 07:00 in Vancouver reports the week that just ended');
select is(public.treasurer_report_week('2026-09-29 20:00:00+00'), '2026-09-21'::date,
  'any day that week reports the week before it');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select public.log_purchase('{
  "purchased_on": "2026-09-20", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000a", "receipt_path": "r/a.jpg",
  "lines": [{"new_item": {"name": "Chips", "type": "snack"}, "pieces": 100, "cost_cents": 5000, "price_cents": 100}]}'::jsonb);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select public.log_purchase('{
  "purchased_on": "2026-09-21", "store": "Superstore",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/b.jpg",
  "lines": [
    {"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 50, "cost_cents": 700, "price_cents": 100},
    {"new_item": {"name": "Popcorn", "type": "snack"}, "pieces": 20, "cost_cents": 300, "price_cents": 100}
  ]}'::jsonb);

-- Sep 22 falls in the week (deposit $30.00); Sep 15 does not.
select pg_temp.cash_day('2026-09-15', 3000, 4000);
select pg_temp.cash_day('2026-09-22', 3000, 6000);

set local role service_role;
create temp table report as select public.weekly_treasurer_report('2026-09-21') as r;

select is((select r ->> 'week_start' from report), '2026-09-21', 'the week starts on the Monday');
select is(jsonb_array_length((select r -> 'deposits' from report)), 1, 'only the sale day inside the week');
select is((select r #>> '{deposits,0,sale_date}' from report), '2026-09-22', 'that sale day');
select is((select (r #>> '{deposits,0,deposit_cents}')::int from report), 3000, 'deposit is the close count less left in box');
select is((select r #>> '{deposits,0,volunteers}' from report), 'Calvin', 'who closed it');
select is((select (r ->> 'deposited_cents')::int from report), 3000, 'total deposited');

select is(jsonb_array_length((select r -> 'to_reimburse' from report)), 2, 'one group per volunteer');
select is((select r #>> '{to_reimburse,0,buyer_name}' from report), 'Calvin', 'groups are in name order');
select is((select (r ->> 'to_reimburse_cents')::int from report), 6000, 'everything still to pay: $50.00 and $10.00');
select is(jsonb_array_length((select r #> '{to_reimburse,1,claims}' from report)), 1, 'Yuki has one claim');
select is(jsonb_array_length((select r -> 'ledger' from report)), 2, 'the ledger lists every claim');
select is((select r #>> '{to_reimburse,0,buyer_full_name}' from report), 'Chun Yu Chan', 'a group carries the full name');
select is((select r #>> '{ledger,0,buyer_full_name}' from report), 'Chun Yu Chan', 'so does the ledger');

select * from finish();
rollback;
