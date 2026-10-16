-- Repacking (ADR-0019, pgTAP).
-- Run with: supabase test db
begin;
select plan(29);

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

-- 250 Peach Slices at 4.20¢, 60 Sour Keys at 18¢, 10 Chips at 50¢.
select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000001",
  "purchased_on": "2026-10-01", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/a.jpg",
  "lines": [
    {"new_item": {"name": "Peach Slices", "type": "treat"}, "pieces": 250, "cost_cents": 1050},
    {"new_item": {"name": "Sour Keys", "type": "treat"}, "pieces": 60, "cost_cents": 1080},
    {"new_item": {"name": "Chips", "type": "snack"}, "pieces": 10, "cost_cents": 500, "price_cents": 100}
  ]}'::jsonb);

create temp table ids as select id, name from public.items;
grant select on ids to authenticated;

-- 31 candy packs, 5 + 1 each, made as a new item.
select is(public.repack(format('{
  "id": "20000000-0000-0000-0000-000000000001",
  "new_item": {"name": "Candy pack", "type": "treat", "storage": "shelf", "price_cents": 200, "bundle_size": 1},
  "packs": 31,
  "sources": [{"item_id": "%s", "pieces_per_pack": 5}, {"item_id": "%s", "pieces_per_pack": 1}],
  "note": "Before the Oct 15 sale"}',
  (select id from ids where name = 'Peach Slices'), (select id from ids where name = 'Sour Keys'))::jsonb),
  '20000000-0000-0000-0000-000000000001'::uuid, 'returns the repack id');

select is((select on_hand from public.item_stock where name = 'Peach Slices'), 95, 'source loses packs × pieces per pack');
select is((select on_hand from public.item_stock where name = 'Sour Keys'), 29, 'second source too');
select is((select on_hand from public.item_stock where name = 'Candy pack'), 31, 'the pack item gains the packs');
select is((select unit_cost_cents from public.items where name = 'Candy pack'), 39.00::numeric(10,2),
  'pack cost is the sum of its pieces (5 × 4.20¢ + 18¢)');
select is((select price_cents || ' ' || bundle_size || ' ' || type || ' ' || storage from public.items where name = 'Candy pack'),
  '200 1 treat shelf', 'the new item is made with its price, type and storage');
select is((select unit_cost_cents from public.items where name = 'Peach Slices'), 4.20::numeric(10,2),
  'source cost is unchanged');
select is((select count(*)::int from public.stock_movements where repack_id = '20000000-0000-0000-0000-000000000001'),
  3, 'one movement per source plus one for the pack');
select is((select packs || ' ' || note || ' ' || (created_by = '00000000-0000-0000-0000-00000000000b')
             from public.repacks where id = '20000000-0000-0000-0000-000000000001'),
  '31 Before the Oct 15 sale true', 'the repack row records packs, note and who');

-- A retry does nothing.
select public.repack(format('{
  "id": "20000000-0000-0000-0000-000000000001",
  "new_item": {"name": "Candy pack", "type": "treat", "price_cents": 200},
  "packs": 31,
  "sources": [{"item_id": "%s", "pieces_per_pack": 5}]}',
  (select id from ids where name = 'Peach Slices'))::jsonb);
select is((select count(*)::int from public.items where name = 'Candy pack'), 1, 'a retry makes no second item');
select is((select on_hand from public.item_stock where name = 'Peach Slices'), 95, 'a retry moves no stock');

-- Items tab.
select is((select repacked_since || ' ' || bought_since from public.item_overview where name = 'Peach Slices'),
  '-155 250', 'Items shows repacked pieces next to bought since');
select is((select repacked_since || ' ' || bought_since from public.item_overview where name = 'Candy pack'),
  '31 0', 'the pack item shows its packs as repacked');

-- A second repack into the existing pack item blends the cost: 31 at 39¢ + 4 at 72¢ (4 Sour Keys).
select public.repack(format('{
  "id": "20000000-0000-0000-0000-000000000002",
  "pack_item_id": "%s", "packs": 4,
  "sources": [{"item_id": "%s", "pieces_per_pack": 4}]}',
  (select id from public.items where name = 'Candy pack'), (select id from ids where name = 'Sour Keys'))::jsonb);
select is((select unit_cost_cents from public.items where name = 'Candy pack'),
  round((31 * 39 + 4 * 72) / 35.0, 2)::numeric(10,2), 'a later repack blends into the weighted average');

-- Pieces gone after two counts ignores repacks: count Peach at 95, repack 10 more out, count 80.
select public.save_stock_count(format('[{"item_id":"%s","pieces":95}]', (select id from ids where name = 'Peach Slices'))::jsonb);
reset role;
alter table public.stock_movements disable trigger stock_movements_append_only;
update public.stock_movements set created_at = now() - interval '7 days' where reason = 'count';
alter table public.stock_movements enable trigger stock_movements_append_only;
set local role authenticated;
select public.repack(format('{
  "id": "20000000-0000-0000-0000-000000000003",
  "pack_item_id": "%s", "packs": 2,
  "sources": [{"item_id": "%s", "pieces_per_pack": 5}]}',
  (select id from public.items where name = 'Candy pack'), (select id from ids where name = 'Peach Slices'))::jsonb);
select is((select repacked_since from public.item_overview where name = 'Peach Slices'), -10,
  'repacked since counts from the last count');
select public.save_stock_count(format('[{"item_id":"%s","pieces":80}]', (select id from ids where name = 'Peach Slices'))::jsonb);
select is((select pieces_gone from public.item_counts where item_id = (select id from ids where name = 'Peach Slices')),
  5, 'repacked pieces are not counted as gone');

-- Repack only items stay out of insights and Deal check.
update public.items set repack_only = true where name in ('Peach Slices', 'Sour Keys');
select is((select repack_only from public.item_overview where name = 'Peach Slices'), true, 'Items reads the flag');
select is((select count(*)::int from public.insights_items where name = 'Peach Slices'), 0,
  'repack only items are left out of item insights');
reset role;
update public.items set price_cents = 100 where name = 'Peach Slices';
set local role authenticated;
select is((select count(*)::int from public.insights_low_margin_items where name = 'Peach Slices'), 0,
  'and out of low margin stock even with a price');

-- Rules.
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "pack_item_id": "%s", "packs": 0, "sources": [{"item_id": "%s", "pieces_per_pack": 1}]}')$q$,
  (select id from public.items where name = 'Candy pack'), (select id from ids where name = 'Chips')),
  'P0001', 'Make at least one pack.', 'at least one pack');
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "pack_item_id": "%s", "packs": 1, "sources": []}')$q$,
  (select id from public.items where name = 'Candy pack')),
  'P0001', 'Add at least one item that went in.', 'at least one source');
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "packs": 1, "sources": [{"item_id": "%s", "pieces_per_pack": 1}]}')$q$,
  (select id from ids where name = 'Chips')),
  'P0001', 'Pick the item you made.', 'a pack item is needed');
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "new_item": {"name": " ", "type": "treat"}, "packs": 1, "sources": [{"item_id": "%s", "pieces_per_pack": 1}]}')$q$,
  (select id from ids where name = 'Chips')),
  'P0001', 'Give the new item a name.', 'a new item needs a name');
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "pack_item_id": "%1$s", "packs": 1, "sources": [{"item_id": "%1$s", "pieces_per_pack": 1}]}')$q$,
  (select id from public.items where name = 'Candy pack')),
  'P0001', 'An item cannot go into itself.', 'the pack item is not a source');
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "pack_item_id": "%s", "packs": 1, "sources": [{"item_id": "%2$s", "pieces_per_pack": 1}, {"item_id": "%2$s", "pieces_per_pack": 2}]}')$q$,
  (select id from public.items where name = 'Candy pack'), (select id from ids where name = 'Chips')),
  'P0001', 'Each item can be added once.', 'each source once');
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "pack_item_id": "%s", "packs": 1, "sources": [{"item_id": "%s", "pieces_per_pack": 0}]}')$q$,
  (select id from public.items where name = 'Candy pack'), (select id from ids where name = 'Chips')),
  'P0001', 'Pieces per pack must be 1 or more.', 'pieces per pack at least 1');
reset role;
update public.items set archived = true where name = 'Chips';
set local role authenticated;
select throws_ok(format($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "pack_item_id": "%s", "packs": 1, "sources": [{"item_id": "%s", "pieces_per_pack": 1}]}')$q$,
  (select id from public.items where name = 'Candy pack'), (select id from ids where name = 'Chips')),
  'P0001', 'That item is archived.', 'no archived sources');

select throws_ok(format($q$insert into public.stock_movements (item_id, qty, reason) values ('%s', -1, 'repacked')$q$,
  (select id from ids where name = 'Sour Keys')),
  '42501', null, 'clients cannot post repacked movements directly');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000ff', 'role', 'authenticated')::text, true);
select throws_ok($q$select public.repack('{"id": "20000000-0000-0000-0000-000000000009", "pack_item_id": "99999999-0000-0000-0000-000000000000", "packs": 1, "sources": [{"item_id": "99999999-0000-0000-0000-000000000001", "pieces_per_pack": 1}]}')$q$,
  'P0001', 'Not signed in as a Snack Shack volunteer.', 'only the team may repack');

select * from finish();
rollback;
