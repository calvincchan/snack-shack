-- What the Sale day screen reads: lineup options, the lineup itself and the
-- bottom-bar totals (pgTAP). Run with: supabase test db
begin;
select plan(14);

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
    {"new_item": {"name": "Popcorn",       "type": "snack"}, "pieces": 40, "cost_cents": 1800, "price_cents": 100},
    {"new_item": {"name": "Chips",         "type": "snack"}, "pieces": 40, "cost_cents": 1600, "price_cents": 100},
    {"new_item": {"name": "Pretzels",      "type": "snack"}, "pieces": 40, "cost_cents": 1200, "price_cents": 100},
    {"new_item": {"name": "Rice crackers", "type": "snack"}, "pieces": 40, "cost_cents": 2000},
    {"new_item": {"name": "Gummies",       "type": "treat"}, "pieces": 40, "cost_cents": 1000, "price_cents": 100},
    {"new_item": {"name": "Mini bars",     "type": "treat"},
     "pieces": 100, "cost_cents": 2000, "price_cents": 100, "bundle_size": 2}
  ]}'::jsonb);

-------------------------------------------------------------------------------
-- Lineup options
-------------------------------------------------------------------------------
select is((select count(*)::int from public.lineup_options), 5,
          'an item that still needs a price is not offered');

select is((select count(*)::int from public.lineup_options where suggested), 5,
          'with five candidates every one of them is suggested');

-- Nothing has ever been out, so every reason tag is New (HANDOFF §5.6).
select is((select count(*) filter (where reason = 'New')::int from public.lineup_options), 5,
          'items never in a finished lineup are tagged New');

select is((select on_hand from public.lineup_options where name = 'Mini bars'), 100,
          'options carry the pieces in storage');

-- Archiving or selling out takes an item off the list.
update public.items set archived = true where name = 'Pretzels';
select is((select count(*)::int from public.lineup_options where name = 'Pretzels'), 0,
          'an archived item cannot be picked');
update public.items set archived = false where name = 'Pretzels';

-------------------------------------------------------------------------------
-- The lineup and its totals
-------------------------------------------------------------------------------
select public.create_sale_day('2026-09-29');

-- Build the prototype's shape by hand: three snacks and two treats.
delete from public.sale_day_items
 where sale_day_id = (select id from public.sale_days);
insert into public.sale_day_items (sale_day_id, item_id)
select (select id from public.sale_days), id from public.items
 where name in ('Popcorn', 'Chips', 'Pretzels', 'Gummies', 'Mini bars');

select is((select day_no from public.sale_day_lineup_totals), 1,
          'the first sale day is number 1');

select is((select snacks from public.sale_day_lineup_totals), 3,
          'three snacks in the lineup');
select is((select treats from public.sale_day_lineup_totals), 2,
          'two treats in the lineup');

-- Nothing has been out, so every rate is the 15 pieces-a-day stand-in and the
-- margin is the plain average: costs 45+40+30+25+20 = 160¢ against prices
-- 100+100+100+100+50 = 450¢ per piece, so 1 − 160/450 = 64%.
select is((select round(margin * 100) from public.sale_day_lineup_totals), 64::numeric,
          'the lineup margin weights each item by how fast it goes');

select is((select expected_count from public.sale_day_lineup where name = 'Popcorn'), 40,
          'Check stock expects what the ledger says');

select is((select price_cents || ' for ' || bundle_size
             from public.sale_day_lineup where name = 'Mini bars'), '100 for 2',
          'a deal keeps its price and deal size');

-------------------------------------------------------------------------------
-- Check stock, then the locks
-------------------------------------------------------------------------------
update public.sale_day_items set check_count = 38, check_reason = 'damaged'
 where item_id = (select id from public.items where name = 'Popcorn');

select is((select items_off from public.sale_day_lineup_totals), 1,
          'one item is off after the count');

select public.start_sale((select id from public.sale_days));

select is((select start_count from public.sale_day_lineup where name = 'Popcorn'), 38,
          'the sale starts from the counted pieces, not the expected ones');

-- An edit during the sale does not move today's price (HANDOFF §5.7).
update public.items set price_cents = 200, bundle_size = 1 where name = 'Popcorn';
select is((select price_cents from public.sale_day_lineup where name = 'Popcorn'), 100,
          'the price the sale started with is the one that counts');

select * from finish();
rollback;
