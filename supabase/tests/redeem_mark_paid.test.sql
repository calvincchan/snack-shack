-- Redeeming a one-time Mark paid link (pgTAP).
-- Run with: supabase test db
begin;
select plan(14);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'treasurer@example.com');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer'),
  ('00000000-0000-0000-0000-00000000000d', 'Treasurer', 'treasurer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select public.log_purchase('{
  "purchased_on": "2026-09-20", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/a.jpg",
  "lines": [{"new_item": {"name": "Chips", "type": "snack"}, "pieces": 100, "cost_cents": 5000, "price_cents": 100}]}'::jsonb);
select public.log_purchase('{
  "purchased_on": "2026-09-21", "store": "Superstore",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/b.jpg",
  "lines": [{"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 50, "cost_cents": 700, "price_cents": 100}]}'::jsonb);

-- The Edge Function calls with the service role and no signed-in user.
select set_config('request.jwt.claims', '', true);
set local role service_role;
create temp table issued as select * from public.issue_mark_paid_tokens();
create temp table late as select * from public.issue_mark_paid_tokens(interval '-1 day');

select is((select count(*)::int from issued), 1, 'one link per volunteer owed');

create temp table done as
  select public.redeem_action_token((select token from issued)) as r;

select is((select (r ->> 'purchases_paid')::int from done), 2, 'both receipts are marked paid');
select is((select r ->> 'buyer_name' from done), 'Yuki', 'the result names the volunteer');
select is((select count(*)::int from public.claims where status = 'paid'), 2, 'the claims are paid');
select is((select count(distinct paid_by)::int from public.claims
            where paid_by = '00000000-0000-0000-0000-00000000000d'), 1, 'paid by the treasurer');

select is((select count(*)::int from public.audit_log
            where table_name = 'purchases' and action = 'UPDATE'
              and new_data ->> 'status' = 'paid'
              and actor = '00000000-0000-0000-0000-00000000000d'), 2,
  'the audit trail shows the treasurer as the actor');

select throws_ok(
  format('select public.redeem_action_token(%L)', (select token from issued)),
  'SS002', 'This link has already been used.', 'a second tap says the link was used');

select throws_ok(
  format('select public.redeem_action_token(%L)', (select token from late)),
  'SS003', 'This link has expired. Use the latest weekly email.', 'an old link says it expired');

select throws_ok($$select public.redeem_action_token('nonsense')$$,
  'SS001', 'This link is not valid.', 'an unknown link is not valid');

-- An expired link marks nothing paid and stays unused.
reset role;
update public.purchases set status = 'to_pay', paid_at = null, paid_by = null, payment_ref = null;
set local role service_role;
select is((select count(*)::int from public.claims where status = 'to_pay'), 2, 'reset for the expiry check');
select throws_ok(
  format('select public.redeem_action_token(%L)', (select token from late)),
  'SS003', null, 'expired link again');
select is((select count(*)::int from public.claims where status = 'paid'), 0, 'expired link pays nothing');

-- Someone already marked one paid in the app: the link pays only what is left.
reset role;
update public.purchases set status = 'paid', paid_at = now(), paid_by = '00000000-0000-0000-0000-00000000000d'
 where claim_no = 1;
set local role service_role;
create temp table again as select * from public.issue_mark_paid_tokens();
select is((select count(*)::int from again), 1, 'only what is still owed gets a link');
select is((select (public.redeem_action_token((select token from again)) ->> 'purchases_paid')::int), 1,
  'the link pays the one left');

select * from finish();
rollback;
