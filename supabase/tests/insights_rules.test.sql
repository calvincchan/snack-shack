-- The rules behind "What the numbers say" (pgTAP).
-- Run with: supabase test db
begin;
select plan(23);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, target_sale_days = 2,
       over_short_ok_cents = 300, over_short_warn_cents = 1000, gst_rate = 0.05,
       max_items_per_kid = 3, max_treats_per_kid = 1, treasurer_email = null;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

-- Runs one finished sale day. See supabase/seed.sql for the same helper.
create function pg_temp.history_day(
  p_date date, p_note text, p_credits int, p_over_short int, p_rows jsonb
) returns void language plpgsql security definer as $fn$
declare
  v_day     uuid;
  v_cur     jsonb := '{}';
  v_start   int;
  v_counted int;
  v_denom   int;
  r         record;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
  v_day := public.create_sale_day(p_date);
  delete from public.sale_day_items where sale_day_id = v_day;

  -- Give each item exactly the stock this sale day needs, so the day's numbers
  -- are the ones written here. The stock is put back after the day closes.
  for r in
    select x.*, i.id as item_id,
           (select on_hand from public.item_stock where id = i.id) as on_hand
      from jsonb_to_recordset(p_rows)
             as x(name text, sold int, "left" int, "out" int, lost int, reason text)
      join public.items i on i.name = x.name
  loop
    v_start := r.sold + r."left" + r."out" + r.lost;
    v_cur := v_cur || jsonb_build_object(r.item_id::text, r.on_hand);
    if v_start <> r.on_hand then
      insert into public.stock_movements (item_id, qty, reason)
      values (r.item_id, v_start - r.on_hand, 'correction');
    end if;
    insert into public.sale_day_items (sale_day_id, item_id, check_count, check_reason)
    values (v_day, r.item_id,
            case when r.lost > 0 then v_start - r.lost end,
            case when r.lost > 0 then r.reason::public.check_reason end);
  end loop;

  perform public.start_sale(v_day);
  perform public.begin_count(v_day);

  for r in
    select x.*, i.id as item_id
      from jsonb_to_recordset(p_rows)
             as x(name text, sold int, "left" int, "out" int, lost int, reason text)
      join public.items i on i.name = x.name
  loop
    update public.sale_day_items
       set left_count = r."left", out_count = r."out"
     where sale_day_id = v_day and item_id = r.item_id;
    if (v_cur ->> r.item_id::text)::int <> r."left" then
      insert into public.stock_movements (item_id, qty, reason)
      values (r.item_id, (v_cur ->> r.item_id::text)::int - r."left", 'correction');
    end if;
  end loop;

  update public.sale_days set helper_credits = p_credits, note = p_note where id = v_day;

  -- Count exactly what the box should hold, plus or minus the over/short.
  select expected_cents + p_over_short into v_counted
    from public.sale_day_totals where sale_day_id = v_day;
  foreach v_denom in array array[2000, 1000, 500, 200, 100, 25, 10, 5] loop
    update public.cash_counts set qty = v_counted / v_denom
     where sale_day_id = v_day and denom_cents = v_denom;
    v_counted := v_counted % v_denom;
  end loop;

  perform public.sign_off(v_day);
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
  perform public.sign_off(v_day);
  perform public.close_sale_day(v_day);

  -- Back-date the close to lunchtime on the sale date (see the note in the seed).
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set closed_at = (sale_date + time '13:30') at time zone 'America/Vancouver'
   where id = v_day;
  perform set_config('snack.fn', '', true);
end $fn$;

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select public.log_purchase('{
  "purchased_on": "2026-09-01", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000a", "receipt_path": "r/a.jpg",
  "lines": [
    {"new_item": {"name": "Pops", "type": "treat"}, "pieces": 100, "cost_cents": 3000, "price_cents": 100},
    {"new_item": {"name": "Chips", "type": "snack"}, "pieces": 100, "cost_cents": 5000, "price_cents": 100},
    {"new_item": {"name": "Seaweed", "type": "snack"}, "pieces": 40, "cost_cents": 3200, "price_cents": 200},
    {"new_item": {"name": "Bar", "type": "treat"}, "pieces": 30, "cost_cents": 3000, "price_cents": 200}
  ]}'::jsonb);

select is((select count(*)::int from public.insights_fading_items), 0, 'no fading items without history');
select is((select count(*)::int from public.insights_sold_out_items), 0, 'nothing sold out without history');
select is((select count(*)::int from public.insights_slowest_item), 0, 'no slowest mover without history');
select is((select count(*)::int from public.insights_treat_share), 0, 'no treat share without sales');
select is((select count(*)::int from public.insights_check_stock_losses), 0, 'no losses without history');

select pg_temp.history_day('2026-09-10', null, 1, 0, '[
  {"name": "Pops",    "sold": 20, "left": 10, "out": 0, "lost": 0},
  {"name": "Chips",   "sold": 20, "left": 0,  "out": 0, "lost": 0},
  {"name": "Seaweed", "sold": 4,  "left": 10, "out": 0, "lost": 0},
  {"name": "Bar",     "sold": 10, "left": 5,  "out": 0, "lost": 2, "reason": "damaged"}
]');

-- One day is not a trend: nothing fades, and the other rules already apply.
select is((select count(*)::int from public.insights_fading_items), 0, 'one day out is not fading');
select is((select sold_out_days from public.insights_sold_out_items where name = 'Chips'), 1, 'chips sold out once');

select pg_temp.history_day('2026-09-15', null, 1, 0, '[
  {"name": "Pops",    "sold": 16, "left": 10, "out": 0, "lost": 0},
  {"name": "Chips",   "sold": 20, "left": 5,  "out": 0, "lost": 0},
  {"name": "Seaweed", "sold": 4,  "left": 10, "out": 0, "lost": 1, "reason": "missing"}
]');

select is((select count(*)::int from public.insights_fading_items), 1, 'only the popsicle-like item fades');
select is((select name from public.insights_fading_items), 'Pops', 'the item that fell from 20 to 16 fades');
select is((select first_pieces from public.insights_fading_items), 20, 'first day out');
select is((select last_pieces from public.insights_fading_items), 16, 'last day out');
select is((select first_date from public.insights_fading_items), '2026-09-10'::date, 'first day out date');
select is((select last_date from public.insights_fading_items), '2026-09-15'::date, 'last day out date');

select is((select count(*)::int from public.insights_sold_out_items), 1, 'only chips sold out');
select is((select days_out from public.insights_sold_out_items), 2, 'chips were out two days');

select is((select name from public.insights_slowest_item), 'Seaweed', 'seaweed sells slowest');
select is((select pieces_per_day_out from public.insights_slowest_item), 4, 'seaweed pieces per day out');

select is((select treat_pieces from public.insights_treat_share), 46, 'treat pieces sold');
select is((select pieces_sold from public.insights_treat_share), 94, 'all pieces sold');
select is((select treat_pct from public.insights_treat_share), 49, 'treat share of items sold');

select is((select pieces from public.insights_check_stock_losses), 3, 'pieces missing or damaged at check stock');
select is((select cost_cents from public.insights_check_stock_losses), 280, 'their cost: 2 bars at $1.00 and 1 seaweed at 80¢');
select is((select items from public.insights_check_stock_losses), 2, 'items affected');

select * from finish();
rollback;
