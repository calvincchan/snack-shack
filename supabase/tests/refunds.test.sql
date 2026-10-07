-- Refunds on a To pay claim (ADR-0013, pgTAP).
-- Run with: supabase test db
begin;
select plan(38);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'priya@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'treasurer@example.com');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer'),
  ('00000000-0000-0000-0000-00000000000c', 'Priya', 'volunteer'),
  ('00000000-0000-0000-0000-00000000000d', 'Treasurer', 'treasurer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- Yuki logs one receipt: Chips 40 pieces for $32.00, Gummies 10 for $6.00.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000001",
  "purchased_on": "2026-09-26", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/a.jpg",
  "lines": [
    {"new_item": {"name": "Chips", "type": "snack"}, "pieces": 40, "cost_cents": 3200, "price_cents": 100},
    {"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 10, "cost_cents": 600, "price_cents": 100}
  ]}'::jsonb);
-- Priya has a second claim that nobody refunds.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000002",
  "purchased_on": "2026-09-27", "store": "Superstore",
  "buyer_id": "00000000-0000-0000-0000-00000000000c", "receipt_path": "r/b.jpg",
  "lines": [{"new_item": {"name": "Crackers", "type": "snack"}, "pieces": 20, "cost_cents": 1000, "price_cents": 100}]}'::jsonb);

create temp table lines as
  select l.id, i.name from public.purchase_lines l join public.items i on i.id = l.item_id;
grant select on lines to authenticated;

set local role authenticated;

-- A stranger to the claim cannot refund it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 5, 400, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'P0001', 'Only Yuki or a coordinator can refund.', 'only the buyer or a coordinator may refund');

-- The buyer refunds 10 of the 40 Chips.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select lives_ok(
  format($$select public.refund_purchase_line('20000000-0000-0000-0000-000000000001', %L, 10, 800, '2026-10-06', 'slip/1.jpg', 'Crushed box')$$,
         (select id from lines where name = 'Chips')),
  'the buyer logs a refund');
select is((select refunded_cents from public.claims where claim_no = 1), 800, 'claim shows the refunded total');
select is((select net_cents from public.claims where claim_no = 1), 3000, 'claim shows the net: 3800 - 800');
select is((select total_cents from public.claims where claim_no = 1), 3800, 'the receipt total does not change');
select is((select pieces from public.purchase_lines where id = (select id from lines where name = 'Chips')), 40, 'the purchase line does not change');
select is((select on_hand from public.item_stock where name = 'Chips'), 30, 'returned pieces leave stock');
select is((select reason::text || ' ' || qty || ' ' || (refund_id = '20000000-0000-0000-0000-000000000001')::text
             from public.stock_movements where reason = 'returned'),
  'returned -10 true', 'a returned movement linked to the refund');
select is((select pieces_left || ' ' || cents_left from public.claim_lines where id = (select id from lines where name = 'Chips')),
  '30 2400', 'the line shows what is left to refund');
select is((select count(*)::int from public.audit_log where table_name = 'purchase_refunds' and action = 'INSERT'), 1, 'the refund is audited');

-- A retry with the same id does not duplicate.
select public.refund_purchase_line('20000000-0000-0000-0000-000000000001', (select id from lines where name = 'Chips'), 10, 800, '2026-10-06');
select is((select count(*)::int from public.purchase_refunds), 1, 'a retry adds no second refund');
select is((select on_hand from public.item_stock where name = 'Chips'), 30, 'a retry takes no more stock');

-- Rules.
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 31, 100, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'P0001', 'Only 30 left on this line.', 'pieces beyond what is left');
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 5, 2401, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'P0001', 'Up to $24.00 left on this line.', 'amount above what is left');
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 0, 100, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'P0001', 'Enter the pieces.', 'pieces must be at least 1');
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 5, 0, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'P0001', 'Enter the refund amount.', 'amount must be above zero');

-- Pieces sold off the shelf are not on hand any more.
reset role;
insert into public.stock_movements (item_id, qty, reason) select id, -25, 'out' from public.items where name = 'Chips';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 10, 100, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'P0001', 'Only 5 on hand.', 'pieces beyond stock on hand');

-- Not while the item is in a sale day that has started.
reset role;
select set_config('snack.fn', 'on', true);
insert into public.sale_days (sale_date, phase, float_cents, started_at) values ('2026-10-06', 'selling', 3000, now());
insert into public.sale_day_items (sale_day_id, item_id) select (select id from public.sale_days), id from public.items where name = 'Gummies';
select set_config('snack.fn', 'off', true);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 2, 100, '2026-10-06')$$, (select id from lines where name = 'Gummies')),
  'P0001', 'Refund after today''s sale closes.', 'item in a sale day past lineup');
-- An item that is not in that lineup is fine.
select lives_ok(
  format($$select public.refund_purchase_line('20000000-0000-0000-0000-000000000002', %L, 5, 400, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'an item outside the lineup can be refunded');

-- A coordinator may refund someone else's claim.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  format($$select public.refund_purchase_line('20000000-0000-0000-0000-000000000003', %L, 5, 500, '2026-10-06')$$, (select id from lines where name = 'Crackers')),
  'a coordinator refunds for a volunteer');

select is((select unit_cost_cents from public.items where name = 'Chips'), 80.00, 'item unit cost is not recalculated');

-- Direct writes are refused.
select throws_ok(
  format($$insert into public.purchase_refunds (purchase_line_id, pieces, amount_cents, refunded_on) values (%L, 1, 1, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  '42501', null, 'no direct inserts');

-- Undo: the row goes, a correction puts the pieces back.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$select public.undo_refund('20000000-0000-0000-0000-000000000002')$$,
  'P0001', 'Only Yuki or a coordinator can undo a refund.', 'a stranger cannot undo a refund');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select lives_ok($$select public.undo_refund('20000000-0000-0000-0000-000000000002')$$, 'the buyer undoes a refund');
select is((select count(*)::int from public.purchase_refunds where id = '20000000-0000-0000-0000-000000000002'), 0, 'undo removes the row');
select is((select qty from public.stock_movements where reason = 'correction' and refund_id = '20000000-0000-0000-0000-000000000002'), 5, 'undo adds a + correction');
select is((select count(*)::int from public.audit_log where table_name = 'purchase_refunds' and action = 'DELETE'), 1, 'the audit log keeps the removed refund');
select is((select net_cents from public.claims where claim_no = 1), 3000, 'net is back after the undo');

-- Refund the rest of Crackers as the coordinator: net 0 drops out of To pay.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.refund_purchase_line('20000000-0000-0000-0000-000000000004', (select id from lines where name = 'Crackers'), 15, 500, '2026-10-06');
select is((select net_cents from public.claims where claim_no = 2), 0, 'a fully refunded claim nets to $0');

reset role;
select is((select jsonb_array_length(public.weekly_treasurer_report() -> 'to_reimburse'))::int, 1, 'net $0 drops out of the weekly email');
select is((select (public.weekly_treasurer_report() ->> 'to_reimburse_cents')::int), 3000, 'the email total is net');

-- Mark paid links store their total and refuse when it has changed.
set local role service_role;
create temp table issued as select * from public.issue_mark_paid_tokens();
select is((select count(*)::int from issued), 1, 'no link for a net $0 claim');
select is((select (payload ->> 'total_cents')::int from public.action_tokens), 3000, 'the link stores the total it was issued for');

reset role;
-- The sale day closes, then Yuki refunds more before the treasurer taps.
select set_config('snack.fn', 'on', true);
update public.sale_days set phase = 'closed', closed_at = now();
select set_config('snack.fn', 'off', true);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.refund_purchase_line(gen_random_uuid(), (select id from lines where name = 'Gummies'), 2, 120, '2026-10-06');
reset role;
set local role service_role;
select throws_ok(
  format('select public.redeem_action_token(%L)', (select token from issued)),
  'SS004', 'The amount changed since this email. Check before you send money; use next week''s email.',
  'a changed total refuses the link');
select is((select count(*)::int from public.claims where status = 'paid'), 0, 'the refused link pays nothing');

-- A link without a stored total redeems as before.
reset role;
update public.action_tokens set payload = payload - 'total_cents';
set local role service_role;
select is((select (public.redeem_action_token((select token from issued)) ->> 'purchases_paid')::int), 1, 'a link with no stored total still redeems');

-- Paid claims take no refund and no undo.
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$select public.refund_purchase_line(gen_random_uuid(), %L, 1, 10, '2026-10-06')$$, (select id from lines where name = 'Chips')),
  'P0001', 'Already paid. Ask the treasurer.', 'no refund on a paid claim');
select throws_ok(
  $$select public.undo_refund('20000000-0000-0000-0000-000000000001')$$,
  'P0001', 'Already paid. Ask the treasurer.', 'no undo on a paid claim');

select * from finish();
rollback;
