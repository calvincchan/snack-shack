-- Occasional stock counts (ADR-0016, pgTAP).
-- Run with: supabase test db
begin;
select plan(23);

set local client_min_messages = warning;
truncate table auth.users, public.items cascade;
alter table public.purchases alter column claim_no restart with 1;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000001",
  "purchased_on": "2026-09-26", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/a.jpg",
  "lines": [
    {"new_item": {"name": "Chips", "type": "snack"}, "pieces": 48, "cost_cents": 3200, "price_cents": 100},
    {"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 10, "cost_cents": 600, "price_cents": 100},
    {"new_item": {"name": "Pretzels", "type": "snack"}, "pieces": 5, "cost_cents": 300, "price_cents": 100}
  ]}'::jsonb);

create temp table ids as select id, name from public.items;
grant select on ids to authenticated;

-- Never counted.
select is((select last_counted_at is null and last_counted_pieces is null and pieces_gone is null
             from public.item_counts where item_id = (select id from ids where name = 'Chips')),
  true, 'an uncounted item has no count');
select is((select bought_since from public.item_counts where item_id = (select id from ids where name = 'Chips')),
  48, 'never counted: everything bought counts as bought');

-- First count: Chips 24 (of 48), Gummies 10 (no change). Pretzels skipped.
select is(public.save_stock_count(format('[{"item_id":"%s","pieces":24},{"item_id":"%s","pieces":10}]',
  (select id from ids where name = 'Chips'), (select id from ids where name = 'Gummies'))::jsonb),
  2, 'saving returns how many items were counted');
select is((select qty from public.stock_movements where reason = 'count' and item_id = (select id from ids where name = 'Chips')),
  -24, 'posts the difference from the ledger');
select is((select qty from public.stock_movements where reason = 'count' and item_id = (select id from ids where name = 'Gummies')),
  0, 'an unchanged item still records the count');
select is((select count(*)::int from public.stock_movements where reason = 'count'), 2, 'skipped items post nothing');
select is((select on_hand from public.item_stock where name = 'Chips'), 24, 'on hand matches the count');
select is((select last_counted_pieces from public.item_counts where item_id = (select id from ids where name = 'Chips')),
  24, 'last counted pieces');
select is((select bought_since from public.item_counts where item_id = (select id from ids where name = 'Chips')),
  0, 'nothing bought since the count');
select is((select pieces_gone from public.item_counts where item_id = (select id from ids where name = 'Chips')),
  null::int, 'pieces gone needs two counts');
select is((select last_counted_at is null from public.item_counts where item_id = (select id from ids where name = 'Pretzels')),
  true, 'a skipped item stays uncounted');

-- Buy 12 more Chips, then count 30: 24 + 12 - 6 gone.
select public.log_purchase(format('{
  "id": "10000000-0000-0000-0000-000000000002",
  "purchased_on": "2026-10-01", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/b.jpg",
  "lines": [{"item_id": "%s", "pieces": 12, "cost_cents": 800}]}', (select id from ids where name = 'Chips'))::jsonb);
select is((select bought_since from public.item_counts where item_id = (select id from ids where name = 'Chips')),
  12, 'bought since counts purchases after the last count');
select public.save_stock_count(format('[{"item_id":"%s","pieces":30}]', (select id from ids where name = 'Chips'))::jsonb);
select is((select qty from public.stock_movements where reason = 'count' order by seq desc limit 1),
  -6, 'the second count posts only the new difference');
select is((select pieces_gone from public.item_counts where item_id = (select id from ids where name = 'Chips')),
  6, 'pieces gone between the last two counts');
select is((select last_counted_pieces || ' ' || bought_since from public.item_overview where name = 'Chips'),
  '30 0', 'Items reads the counts');

select is((select pieces_gone from public.item_overview where name = 'Chips'), 6, 'Items reads pieces gone');

-- Saving again straight away posts only the new difference (none).
select public.save_stock_count(format('[{"item_id":"%s","pieces":30}]', (select id from ids where name = 'Chips'))::jsonb);
select is((select qty from public.stock_movements where reason = 'count' order by seq desc limit 1),
  0, 'a repeat save posts a zero difference');

-- Rules.
select throws_ok(
  format('select public.save_stock_count(%L::jsonb)', format('[{"item_id":"%1$s","pieces":1},{"item_id":"%1$s","pieces":2}]', (select id from ids where name = 'Chips'))),
  'P0001', 'Each item can be counted once per save.', 'an item twice in one save is refused');
select throws_ok(
  $$select public.save_stock_count('[{"item_id":"99999999-0000-0000-0000-000000000000","pieces":1}]'::jsonb)$$,
  'P0001', 'That item no longer exists.', 'an unknown item is refused');
reset role;
update public.items set archived = true where name = 'Pretzels';
set local role authenticated;
select throws_ok(
  format('select public.save_stock_count(%L::jsonb)', format('[{"item_id":"%s","pieces":1}]', (select id from ids where name = 'Pretzels'))),
  'P0001', 'That item is archived.', 'an archived item is refused');
select throws_ok(
  format('select public.save_stock_count(%L::jsonb)', format('[{"item_id":"%s","pieces":-1}]', (select id from ids where name = 'Chips'))),
  'P0001', 'Pieces must be 0 or more.', 'no negative counts');
select throws_ok($$select public.save_stock_count('[]'::jsonb)$$, 'P0001', 'Count at least one item.', 'an empty count is refused');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000ff', 'role', 'authenticated')::text, true);
select throws_ok(
  format('select public.save_stock_count(%L::jsonb)', format('[{"item_id":"%s","pieces":1}]', (select id from ids where name = 'Chips'))),
  'P0001', 'Not signed in as a Snack Shack volunteer.', 'only the team may count');

select * from finish();
rollback;
