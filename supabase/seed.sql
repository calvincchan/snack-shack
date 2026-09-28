-- Local development data: the prototype's team, items and receipts.
--
-- Everything goes in through the real functions, so stock, weighted-average
-- costs and claim numbers come out the way they would in production. Sale day
-- history is not seeded yet, so stock is what was bought, nothing sold.

begin;

-- People ---------------------------------------------------------------------
-- The first account on an empty database becomes the coordinator (ADR-0011),
-- so Calvin goes first. The others need a profile written for them.
-- The blank instance id and the empty token columns are what Auth expects; a
-- row without them is invisible to it, and asking for a magic link then fails
-- with "Database error saving new user".
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, now(),
       '', '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', '',
       now(), now()
from (values
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b'::uuid, 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000c'::uuid, 'priya@example.com'),
  ('00000000-0000-0000-0000-00000000000d'::uuid, 'treasurer@example.com')
) as seeded (id, email)
order by seeded.id;   -- Calvin's id sorts first, so he becomes the coordinator

update public.profiles set display_name = 'Calvin'
 where id = '00000000-0000-0000-0000-00000000000a';

insert into public.profiles (id, email, display_name, role) values
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com',      'Yuki',      'volunteer'),
  ('00000000-0000-0000-0000-00000000000c', 'priya@example.com',     'Priya',     'volunteer'),
  ('00000000-0000-0000-0000-00000000000d', 'treasurer@example.com', 'Treasurer', 'treasurer');

update public.settings set treasurer_email = 'treasurer@example.com';

-- Receipts -------------------------------------------------------------------
-- log_purchase() needs a signed-in volunteer; pretend to be Calvin.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);

-- SS-001
select public.log_purchase('{
  "purchased_on": "2026-09-08", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000a", "receipt_path": "seed/costco-0908.jpg",
  "lines": [
    {"new_item": {"name": "Popcorn, lightly salted", "type": "snack"}, "pieces": 48, "cost_cents": 2160, "price_cents": 100},
    {"new_item": {"name": "Chips, assorted",         "type": "snack"}, "pieces": 90, "cost_cents": 4680, "price_cents": 100},
    {"new_item": {"name": "Pretzel twists",          "type": "snack"}, "pieces": 60, "cost_cents": 2280, "price_cents": 100},
    {"new_item": {"name": "Cheddar crackers",        "type": "snack"}, "pieces": 72, "cost_cents": 2952, "price_cents": 100},
    {"new_item": {"name": "Granola bar",             "type": "treat"}, "pieces": 60, "cost_cents": 2100, "price_cents": 100},
    {"new_item": {"name": "Ice-cream bar", "type": "treat", "storage": "freezer"}, "pieces": 48, "cost_cents": 5040, "price_cents": 200},
    {"new_item": {"name": "Fruit popsicle", "type": "treat", "storage": "freezer"}, "pieces": 48, "cost_cents": 1584, "price_cents": 100}
  ]}'::jsonb);

-- SS-002
select public.log_purchase('{
  "purchased_on": "2026-09-18", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000c", "receipt_path": "seed/costco-0918.jpg",
  "lines": [
    {"new_item": {"name": "Fruit gummies", "type": "treat"}, "pieces": 40, "cost_cents": 1200, "price_cents": 100},
    {"new_item": {"name": "Chocolate bar", "type": "treat"}, "pieces": 24, "cost_cents": 2280, "price_cents": 200}
  ]}'::jsonb);

-- SS-003. More popsicles at the same cost per piece, so the weighted average holds.
select public.log_purchase(jsonb_build_object(
  'purchased_on', '2026-09-21', 'store', 'Superstore',
  'buyer_id', '00000000-0000-0000-0000-00000000000b', 'receipt_path', 'seed/superstore-0921.jpg',
  'lines', jsonb_build_array(
    jsonb_build_object('item_id', (select id from public.items where name = 'Fruit popsicle'),
                       'pieces', 24, 'cost_cents', 792),
    jsonb_build_object('new_item', jsonb_build_object('name', 'Veggie straws', 'type', 'snack'),
                       'pieces', 30, 'cost_cents', 1440, 'price_cents', 100),
    jsonb_build_object('new_item', jsonb_build_object('name', 'Seaweed snack', 'type', 'snack'),
                       'pieces', 24, 'cost_cents', 2040, 'price_cents', 200))));

-- SS-004. Rice crackers are logged with "Decide later", so they need a price.
select public.log_purchase('{
  "purchased_on": "2026-09-25", "store": "Superstore",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "seed/superstore-0925.jpg",
  "lines": [
    {"new_item": {"name": "Rice crackers",       "type": "snack"}, "pieces": 50, "cost_cents": 1499},
    {"new_item": {"name": "Mandarin fruit cups", "type": "snack"}, "pieces": 24, "cost_cents": 1968, "price_cents": 100}
  ]}'::jsonb);

-- SS-005. 13.84¢ a piece, so "2 for $1" is suggested at 72% (HANDOFF §5.3).
select public.log_purchase('{
  "purchased_on": "2026-09-26", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000a", "receipt_path": "seed/costco-0926.jpg",
  "lines": [
    {"new_item": {"name": "Nestlé mini bars, assorted", "type": "treat"},
     "pieces": 130, "cost_cents": 1799, "price_cents": 100, "bundle_size": 2}
  ]}'::jsonb);

-- The two oldest claims have already been reimbursed.
update public.purchases
   set status = 'paid', paid_at = purchased_on + interval '4 days',
       paid_by = '00000000-0000-0000-0000-00000000000d', payment_ref = 'E-transfer'
 where claim_no in (1, 2);

select set_config('request.jwt.claims', '', true);

commit;
