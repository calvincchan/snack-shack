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
-- The receipt_path values below point at the private `receipts` bucket, but no
-- photo is uploaded, so the receipt links on seeded claims will not open. Log a
-- receipt through the app to get one with a real photo.
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

-- One finished sale day -------------------------------------------------------
-- Enough history for the averages that What to buy and Insights need: pieces
-- sold per sale day, an item that closed at 0, and a count-up note.
do $$
declare
  v_day  uuid;
  v_item record;
  v_left int;
begin
  v_day := public.create_sale_day('2026-09-24');

  -- create_sale_day() suggests a lineup; use the prototype's instead.
  delete from public.sale_day_items where sale_day_id = v_day;
  insert into public.sale_day_items (sale_day_id, item_id)
  select v_day, id from public.items
   where name in ('Popcorn, lightly salted', 'Chips, assorted', 'Pretzel twists',
                  'Fruit gummies', 'Chocolate bar');

  perform public.start_sale(v_day);
  perform public.begin_count(v_day);

  -- What was left at the end. The gummies sold out.
  for v_item in
    select sdi.item_id, i.name, sdi.start_count
      from public.sale_day_items sdi
      join public.items i on i.id = sdi.item_id
     where sdi.sale_day_id = v_day
  loop
    v_left := case v_item.name
                when 'Popcorn, lightly salted' then v_item.start_count - 14
                when 'Chips, assorted'         then v_item.start_count - 26
                when 'Pretzel twists'          then v_item.start_count - 18
                when 'Fruit gummies'           then 0
                else v_item.start_count - 9
              end;
    update public.sale_day_items
       set left_count = v_left,
           out_count = case when v_item.name = 'Chocolate bar' then 1 else 0 end
     where sale_day_id = v_day and item_id = v_item.item_id;
  end loop;

  update public.sale_days
     set helper_credits = 1,
         note = 'Gummies went first. A few kids asked for popcorn after it ran out last time.'
   where id = v_day;

  -- $30 float plus $114 of sales, less the $1 helper credit, is $143 expected.
  -- The box counted $142, a dollar short, which is a good count up.
  update public.cash_counts set qty = 2  where sale_day_id = v_day and denom_cents = 2000;
  update public.cash_counts set qty = 3  where sale_day_id = v_day and denom_cents = 1000;
  update public.cash_counts set qty = 5  where sale_day_id = v_day and denom_cents = 500;
  update public.cash_counts set qty = 20 where sale_day_id = v_day and denom_cents = 200;
  update public.cash_counts set qty = 7  where sale_day_id = v_day and denom_cents = 100;

  perform public.sign_off(v_day);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text,
    true);
  perform public.sign_off(v_day);
  perform public.close_sale_day(v_day);

  -- close_sale_day() stamps now(). The Done screen shows any sale day closed in
  -- the last few hours, so back-date this one to lunchtime on its sale date;
  -- otherwise every fresh reset opens on "Seal $X in the deposit bag".
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set closed_at = (sale_date + time '13:30') at time zone 'America/Vancouver'
   where id = v_day;
  perform set_config('snack.fn', '', true);
end $$;

select set_config('request.jwt.claims', '', true);

commit;
