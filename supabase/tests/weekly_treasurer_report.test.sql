-- What the weekly treasurer email is built from (pgTAP).
-- Run with: supabase test db
begin;
select plan(13);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, target_sale_days = 2,
       over_short_ok_cents = 300, over_short_warn_cents = 1000, gst_rate = 0.05,
       max_items_per_kid = 3, max_treats_per_kid = 1, treasurer_email = null;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'treasurer@example.com');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer'),
  ('00000000-0000-0000-0000-00000000000d', 'Treasurer', 'treasurer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

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

select is(public.treasurer_report_week('2026-09-28 14:00:00+00'), '2026-09-21'::date,
  'Monday 07:00 in Vancouver reports the week that just ended');
select is(public.treasurer_report_week('2026-09-29 20:00:00+00'), '2026-09-21'::date,
  'any day that week reports the week before it');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select public.log_purchase('{
  "purchased_on": "2026-09-20", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000a", "receipt_path": "r/a.jpg",
  "lines": [{"new_item": {"name": "Chips", "type": "snack"}, "pieces": 100, "cost_cents": 5000, "price_cents": 100}]}'::jsonb);
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select public.log_purchase('{
  "purchased_on": "2026-09-21", "store": "Superstore",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/b.jpg",
  "lines": [
    {"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 50, "cost_cents": 700, "price_cents": 100},
    {"new_item": {"name": "Popcorn", "type": "snack"}, "pieces": 20, "cost_cents": 300, "price_cents": 100}
  ]}'::jsonb);

-- Sep 22 falls in the week (deposit $30.00); Sep 15 does not.
select pg_temp.history_day('2026-09-15', null, 0, 0, '[{"name": "Chips", "sold": 10, "left": 10, "out": 0, "lost": 0}]');
select pg_temp.history_day('2026-09-22', null, 0, 0, '[{"name": "Chips", "sold": 30, "left": 10, "out": 0, "lost": 0}]');

set local role service_role;
create temp table report as select public.weekly_treasurer_report('2026-09-21') as r;

select is((select r ->> 'week_start' from report), '2026-09-21', 'the week starts on the Monday');
select is(jsonb_array_length((select r -> 'deposits' from report)), 1, 'only the sale day inside the week');
select is((select r #>> '{deposits,0,sale_date}' from report), '2026-09-22', 'that sale day');
select is((select (r #>> '{deposits,0,deposit_cents}')::int from report), 3000, 'deposit is counted cash less the float');
select is((select r #>> '{deposits,0,volunteers}' from report), 'Calvin, Yuki', 'who signed off');
select is((select (r ->> 'deposited_cents')::int from report), 3000, 'total deposited');

select is(jsonb_array_length((select r -> 'to_reimburse' from report)), 2, 'one group per volunteer');
select is((select r #>> '{to_reimburse,0,buyer_name}' from report), 'Calvin', 'groups are in name order');
select is((select (r ->> 'to_reimburse_cents')::int from report), 6000, 'everything still to pay: $50.00 and $10.00');
select is(jsonb_array_length((select r #> '{to_reimburse,1,claims}' from report)), 1, 'Yuki has one claim');
select is(jsonb_array_length((select r -> 'ledger' from report)), 2, 'the ledger lists every claim');

select * from finish();
rollback;
