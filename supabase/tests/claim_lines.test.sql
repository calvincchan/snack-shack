-- Claim lines: the receipt view in Buy > Claims reads them from the database.
-- Run with: supabase test db
begin;
select plan(4);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com');
-- The first sign-in on an empty database becomes the coordinator (ADR-0011).
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000001",
  "purchased_on": "2026-09-26", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/costco-0926.jpg",
  "lines": [
    {"new_item": {"name": "Chips, assorted", "type": "snack"}, "pieces": 30, "cost_cents": 1560},
    {"new_item": {"name": "Rice crackers", "type": "snack"}, "pieces": 50, "cost_cents": 1499}
  ]}'::jsonb);

select is((select count(*)::int from public.claim_lines), 2, 'a line per receipt line');
select is(
  (select array_agg(item_name || ' ' || pieces || ' ' || cost_cents order by line_no) from public.claim_lines),
  array['Chips, assorted 30 1560', 'Rice crackers 50 1499'],
  'lines carry item, pieces and cost in receipt order');
select is(
  (select sum(cost_cents)::int from public.claim_lines),
  (select total_cents from public.claims),
  'lines add up to the claim total');
select is(
  (select count(*)::int from public.claim_lines where purchase_id = (select id from public.claims)),
  2, 'lines join to their claim');

select * from finish();
rollback;
