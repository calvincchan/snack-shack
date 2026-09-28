-- Editing an item: optimistic concurrency and archiving (pgTAP).
-- Run with: supabase test db
begin;
select plan(8);

-- The seed fills the database for local development. These tests describe
-- behaviour from an empty start, so clear it inside the transaction.
set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, target_sale_days = 2,
       over_short_ok_cents = 300, over_short_warn_cents = 1000, gst_rate = 0.05,
       max_items_per_kid = 3, max_treats_per_kid = 1, treasurer_email = null;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com');
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
  "purchased_on": "2026-09-26", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/costco.jpg",
  "lines": [
    {"new_item": {"name": "Fruit gummies", "type": "treat"}, "pieces": 40, "cost_cents": 1200, "price_cents": 100},
    {"new_item": {"name": "Chips, assorted", "type": "snack"}, "pieces": 30, "cost_cents": 1560, "price_cents": 100}
  ]}'::jsonb);

create temp table loaded on commit drop as
  select id, version from public.items where name = 'Fruit gummies';

-- Yuki saves first.
update public.items set price_cents = 200, bundle_size = 1
 where id = (select id from loaded) and version = (select version from loaded);
select is((select version from public.items where id = (select id from loaded)),
          (select version + 1 from loaded), 'saving bumps the version');
select is((select updated_by from public.items where id = (select id from loaded)),
          '00000000-0000-0000-0000-00000000000b'::uuid, 'the item records who saved it');

-- Calvin loaded the older version and saves over it: nothing happens, by design.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
with attempt as (
  update public.items set type = 'snack'
   where id = (select id from loaded) and version = (select version from loaded)
  returning 1
)
select is((select count(*)::int from attempt), 0, 'a save from a stale version changes nothing');
select is((select type::text from public.items where id = (select id from loaded)), 'treat',
          'and the type Yuki left is untouched');
select is((select price_cents from public.items where id = (select id from loaded)), 200,
          'and so is her price');

-- Keeping his own edit means saving again against her version.
update public.items set type = 'snack'
 where id = (select id from loaded) and version = (select version + 1 from loaded);
select is((select type::text from public.items where id = (select id from loaded)), 'snack',
          'saving against the version he was shown works');

-- Archiving keeps the row but takes the item out of play.
update public.items set archived = true where id = (select id from loaded);
select is((select archived from public.item_overview where name = 'Fruit gummies'), true,
          'an archived item is still there to read');

select public.create_sale_day('2026-09-29');
select throws_like($$
  insert into public.sale_day_items (sale_day_id, item_id)
  select (select id from public.sale_days), id from public.items where name = 'Fruit gummies'
$$, '%Only priced, active items%', 'an archived item cannot go in a lineup');

select * from finish();
rollback;
