-- What the Items tab reads (pgTAP).
-- Run with: supabase test db
begin;
select plan(8);

-- The seed fills the database for local development. These tests describe
-- behaviour from an empty start, so clear it inside the transaction.
set local client_min_messages = warning;
truncate table auth.users, public.items cascade;
alter table public.purchases alter column claim_no restart with 1;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com');
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text,
  true);

select public.log_purchase('{
  "purchased_on": "2026-09-26", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/costco.jpg",
  "lines": [
    {"new_item": {"name": "Nestlé mini bars, assorted", "type": "treat"},
     "pieces": 130, "cost_cents": 1799, "price_cents": 100, "bundle_size": 2},
    {"new_item": {"name": "Rice crackers", "type": "snack"}, "pieces": 50, "cost_cents": 1499}
  ]}'::jsonb);

select is((select count(*)::int from public.item_overview), 2, 'one row per item');
select is((select on_hand from public.item_overview where name = 'Rice crackers'), 50,
          'stock comes from the ledger');
select is((select unit_cost_cents from public.item_overview where name = 'Rice crackers'),
          29.98::numeric(10,2), 'cost per piece is fractional cents');
select is((select last_bought_by from public.item_overview where name = 'Rice crackers'), 'Yuki',
          'the buyer of the newest receipt is named');
select is((select price_cents from public.item_overview where name = 'Rice crackers'), null::int,
          'rice crackers still need a price');

-- Never in a finished lineup, so everything is New.
select is((select count(*) filter (where is_new)::int from public.item_overview), 2,
          'nothing has been out yet, so everything is New');
select is((select days_out from public.item_overview where name = 'Rice crackers'), 0,
          'no days out yet');

-- A member may price an item straight from the Items tab.
update public.items set price_cents = 100, bundle_size = 1 where name = 'Rice crackers';
select is((select price_cents from public.item_overview where name = 'Rice crackers'), 100,
          'a volunteer can give an item a price');

select * from finish();
rollback;
