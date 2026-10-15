-- Mark paid, mark unpaid, the send record and the buyer rule (ADR-0017, pgTAP).
-- Run with: supabase test db
begin;
select plan(25);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'priya@example.com');
insert into public.profiles (id, display_name, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'Chun Yu Chan', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', null, 'volunteer'),
  ('00000000-0000-0000-0000-00000000000c', 'Priya', 'Priya Patel', 'volunteer')
on conflict (id) do update
  set display_name = excluded.display_name, full_name = excluded.full_name, role = excluded.role;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- The buyer rule ---------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000001", "purchased_on": "2026-10-01", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/1.jpg",
  "lines": [{"new_item": {"name": "Chips", "type": "snack"}, "pieces": 40, "cost_cents": 3200, "price_cents": 100}]
}'::jsonb) $$, 'a volunteer logs their own purchase');
select throws_ok($$ select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000002", "purchased_on": "2026-10-01", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000c", "receipt_path": "r/2.jpg",
  "lines": [{"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 10, "cost_cents": 600, "price_cents": 100}]
}'::jsonb) $$, 'P0001', 'Only the coordinator can log a purchase for someone else.',
  'a volunteer cannot log for another volunteer');
select is((select count(*)::int from public.purchases), 1, 'the refused purchase left nothing behind');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000002", "purchased_on": "2026-10-02", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000c", "receipt_path": "r/2.jpg",
  "lines": [{"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 10, "cost_cents": 600, "price_cents": 100}]
}'::jsonb) $$, 'the coordinator logs for another volunteer');
select lives_ok($$ select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000003", "purchased_on": "2026-10-03", "store": "Walmart",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/3.jpg",
  "lines": [{"new_item": {"name": "Crackers", "type": "snack"}, "pieces": 20, "cost_cents": 1000, "price_cents": 100}]
}'::jsonb) $$, 'and for Yuki again');

-- Mark paid --------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.mark_claims_paid(array['10000000-0000-0000-0000-000000000001'::uuid], 3200, '2026-10-05') $$,
  'P0001', 'Only the coordinator can do this.', 'a volunteer cannot mark paid');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.mark_claims_paid(array['10000000-0000-0000-0000-000000000001'::uuid], 3200, '2999-01-01') $$,
  'P0001', 'The paid date cannot be in the future.', 'the paid date cannot be in the future');
select throws_ok(
  $$ select public.mark_claims_paid(array['10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid], 4000, '2026-10-05') $$,
  'P0001', 'A claim changed since you loaded this list. Check it and try again.',
  'a total that is not what was loaded is refused');
select is((select count(*)::int from public.purchases where status = 'paid'), 0, 'a refused mark paid pays nothing');

select is(public.mark_claims_paid(array['10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid], 4200, '2026-10-05', '  Cheque #142 '), 2,
  'the coordinator marks one volunteer''s claims paid');
select is((select payment_note || '|' || paid_by::text || '|' || (paid_at at time zone 'America/Vancouver')::date::text
             from public.purchases where claim_no = 1),
  'Cheque #142|00000000-0000-0000-0000-00000000000a|2026-10-05', 'paid note (trimmed), who and paid date are kept');
select throws_ok(
  $$ select public.mark_claims_paid(array['10000000-0000-0000-0000-000000000001'::uuid], 3200, '2026-10-05') $$,
  'P0001', 'A claim changed since you loaded this list. Check it and try again.',
  'a claim that is already paid is refused');
select throws_ok(
  $$ select public.mark_claims_paid(array[]::uuid[], 0, '2026-10-05') $$,
  'P0001', 'Pick the claims to mark paid.', 'an empty list is refused');
select ok(exists (select 1 from public.audit_log where table_name = 'purchases' and action = 'UPDATE'
             and new_data ->> 'payment_note' = 'Cheque #142'), 'the audit log shows the payment');

-- Mark unpaid ------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.mark_claim_unpaid('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'Only the coordinator can do this.', 'a volunteer cannot mark unpaid');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.mark_claim_unpaid('10000000-0000-0000-0000-000000000001') $$, 'the coordinator marks a claim unpaid');
select is((select status::text || '|' || coalesce(paid_at::text, '-') || '|' || coalesce(payment_note, '-')
             from public.purchases where claim_no = 1), 'to_pay|-|-', 'it is back in To pay, with no paid date or note');
select throws_ok($$ select public.mark_claim_unpaid('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'That claim is not paid.', 'a claim that is not paid cannot be marked unpaid');

-- Send record and report --------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.claims_report() $$, 'P0001', 'Only the coordinator can do this.',
  'a volunteer cannot read the report');
select throws_ok($$ select public.record_claims_send('treasurer@example.com', 2, 4200) $$, 'P0001',
  'Only the coordinator can do this.', 'a volunteer cannot record a send');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select jsonb_array_length(public.claims_report() -> 'to_reimburse'))::int, 2,
  'the report lists a card per volunteer owed, claim by claim');
select is((select (public.claims_report() ->> 'to_reimburse_cents')::int), 3800, 'the report total is net');
select is((select public.claims_report() -> 'to_reimburse' -> 0 ->> 'buyer_full_name'), 'Priya Patel',
  'the report carries the name on the cheque');
select lives_ok($$ select public.record_claims_send('treasurer@example.com', 2, 3800) $$, 'the coordinator records a send');
select is((select sent_by_name || '|' || sent_to from public.last_claims_send), 'Calvin|treasurer@example.com',
  'Last sent shows who sent it and to whom');

select * from finish();
rollback;
