-- Local development data: the prototype's team, items and receipts.
--
-- Everything goes in through the real functions, so stock, weighted-average
-- costs and claim numbers come out the way they would in production. Sale day
-- history is seeded below; stock on hand is what was bought less the last sale day.

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
  ('00000000-0000-0000-0000-00000000000d', 'treasurer@example.com', 'Treasurer', 'volunteer');

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

-- SS-004. Rice crackers are logged without a price, so they need one.
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
       paid_by = '00000000-0000-0000-0000-00000000000d', payment_note = 'Cheque #101'
 where claim_no in (1, 2);

-- Sale day history -----------------------------------------------------------
-- Five closed sale days with open and close cash counts (ADR-0015), so the
-- Sale day and Insights screens have a term to read. The Sep 17 box opened $2
-- short of what was left after Sep 15, to show the open-count warning.
create function pg_temp.cash_day(
  p_date date, p_open int, p_close int, p_left int, p_note text, p_closer uuid
) returns void language plpgsql security definer as $fn$
declare
  v_day uuid;
  v_left int;
  v_denom int;
  v_kind public.cash_count_kind;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_closer, 'role', 'authenticated')::text, true);
  v_day := public.open_sale_day(p_date);
  foreach v_kind in array array['open', 'close']::public.cash_count_kind[] loop
    v_left := case v_kind when 'open' then p_open else p_close end;
    foreach v_denom in array array[2000, 1000, 500, 200, 100, 25, 10, 5] loop
      perform set_config('snack.fn', 'on', true);
      update public.cash_counts set qty = v_left / v_denom
       where sale_day_id = v_day and kind = v_kind and denom_cents = v_denom;
      perform set_config('snack.fn', '', true);
      v_left := v_left % v_denom;
    end loop;
    if v_kind = 'open' then perform public.start_selling(v_day); end if;
  end loop;
  perform public.close_sale_day(v_day, p_left, p_note);

  -- close_sale_day() stamps now(). Back-date the close to lunchtime on the
  -- sale date so a fresh reset doesn't open on the Done screen.
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set selling_at = (sale_date + time '12:40') at time zone 'America/Vancouver',
         closed_at  = (sale_date + time '13:05') at time zone 'America/Vancouver'
   where id = v_day;
  perform set_config('snack.fn', '', true);
end $fn$;

select pg_temp.cash_day('2026-09-10', 3000, 13275, 3000, null, '00000000-0000-0000-0000-00000000000a');
select pg_temp.cash_day('2026-09-15', 3000, 12450, 3000, 'Ketchup chips left over, BBQ gone first.', '00000000-0000-0000-0000-00000000000b');
select pg_temp.cash_day('2026-09-17', 2800, 12100, 3000, null, '00000000-0000-0000-0000-00000000000a');
select pg_temp.cash_day('2026-09-22', 3000, 11325, 3000, 'Two kids asked for Pocky.', '00000000-0000-0000-0000-00000000000b');
select pg_temp.cash_day('2026-09-24', 3000, 14200, 3000,
  'Gummies went first. A few kids asked for popcorn after it ran out last time.', '00000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '', true);

commit;
