-- Insights views and rules (ADR-0015, ADR-0016, HANDOFF §4.5 and §5.8, pgTAP).
-- Run with: supabase test db
begin;
select plan(22);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;
alter table public.purchases alter column claim_no restart with 1;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com');
insert into public.profiles (id, display_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Calvin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'Yuki', 'volunteer')
on conflict (id) do update
  set display_name = excluded.display_name, role = excluded.role;

-- A closed sale day with chosen open and close totals, all in $20 bills and
-- loonies so the arithmetic stays readable.
create function pg_temp.cash_day(p_date date, p_open int, p_close int, p_left int)
returns void language plpgsql security definer as $fn$
declare
  v_day uuid;
  v_kind public.cash_count_kind;
  v_total int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
  v_day := public.open_sale_day(p_date);
  foreach v_kind in array array['open', 'close']::public.cash_count_kind[] loop
    v_total := case v_kind when 'open' then p_open else p_close end;
    perform set_config('snack.fn', 'on', true);
    update public.cash_counts set qty = v_total / 2000
     where sale_day_id = v_day and kind = v_kind and denom_cents = 2000;
    update public.cash_counts set qty = (v_total % 2000) / 100
     where sale_day_id = v_day and kind = v_kind and denom_cents = 100;
    perform set_config('snack.fn', '', true);
    if v_kind = 'open' then perform public.start_selling(v_day); end if;
  end loop;
  perform public.close_sale_day(v_day, p_left, null);
end $fn$;

-- Nothing yet.
select is((select sale_days from public.insights_term), 0, 'no sale days yet');
select is((select count(*)::int from public.insights_revenue_trend), 0, 'no trend without sale days');

-- Sep 10: revenue 10000. Sep 17 opens $2 short of the $30 left: revenue 9200.
-- Oct 8: revenue 6000.
select pg_temp.cash_day('2026-09-10', 3000, 13000, 3000);
select pg_temp.cash_day('2026-09-17', 2800, 12000, 3000);
select pg_temp.cash_day('2026-10-08', 3000, 9000, 3000);

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
select public.log_purchase('{
  "id": "10000000-0000-0000-0000-000000000002",
  "purchased_on": "2026-10-05", "store": "Superstore",
  "buyer_id": "00000000-0000-0000-0000-00000000000b", "receipt_path": "r/b.jpg",
  "lines": [
    {"new_item": {"name": "Pocky", "type": "treat"}, "pieces": 10, "cost_cents": 900, "price_cents": 100}
  ]}'::jsonb);

-- Term and months.
select is((select (sale_days, revenue_cents, claims_cents, difference_cents, revenue_per_day_cents)::text
             from public.insights_term),
  '(3,25200,5000,20200,8400)', 'term totals: revenue, net claims, difference, average per sale day');
select is((select (revenue_cents, claims_cents, difference_cents)::text from public.insights_months
            where month = '2026-09-01'),
  '(19200,4100,15100)', 'September: revenue, claims, difference');
select is((select (revenue_cents, claims_cents, difference_cents)::text from public.insights_months
            where month = '2026-10-01'),
  '(6000,900,5100)', 'October: revenue, claims, difference');

-- A refund lowers net claims.
reset role;
insert into public.purchase_refunds (purchase_line_id, pieces, amount_cents, refunded_on)
select l.id, 1, 100, '2026-10-06'
  from public.purchase_lines l join public.purchases p on p.id = l.purchase_id
 where p.claim_no = 2;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select is((select claims_cents from public.insights_months where month = '2026-10-01'),
  800, 'a refund comes off the month''s claims');

-- Rule 1: best month.
select is((select month::text from public.insights_best_month), '2026-09-01', 'best month is the one with most left after claims');

-- Rule 2: revenue trend. Oct 8 made $60 against the usual (100 + 92) / 2 = $96.
select is((select (sale_date::text, revenue_cents, usual_cents, difference_cents)::text from public.insights_revenue_trend),
  '(2026-10-08,6000,9600,-3600)', 'last sale day against the usual');

-- Rule 3: open count off.
select is((select sale_days from public.insights_open_count_off), 1, 'one sale day opened with a different amount');

-- Stock counts, back-dated onto two days.
reset role;
insert into public.stock_movements (item_id, qty, reason, created_at)
select i.id, v.qty, 'count', (v.on_day + time '12:00') at time zone 'America/Vancouver'
  from (values
    ('Chips',   -24, date '2026-09-27'),
    ('Pretzels',  0, date '2026-09-27'),
    ('Gummies',   0, date '2026-09-27'),
    ('Chips',   -14, date '2026-10-04'),
    ('Pretzels',  0, date '2026-10-04')
  ) as v (name, qty, on_day)
  join public.items i on i.name = v.name
 order by v.on_day;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.insights_items), 2, 'only items counted on two days are listed');
select is((select pieces_gone from public.insights_items where name = 'Chips'), 14, 'Chips: pieces gone between the last two counts');
select is((select revenue_estimate_cents from public.insights_items where name = 'Chips'), 1400, 'Chips: pieces gone times price');
select is((select round(margin::numeric, 2) from public.insights_items where name = 'Chips'), 0.33, 'Chips: margin at today''s cost');
select is((select pieces_gone from public.insights_items where name = 'Pretzels'), 0, 'counted twice with nothing gone is zero, not missing');
select is((select count(*)::int from public.insights_items where name = 'Gummies'), 0, 'counted once: not listed yet');

-- Rule 4: slowest mover.
select is((select name from public.insights_slowest_item), 'Pretzels', 'slowest mover has the fewest pieces gone');

-- Rule 5: low margin stock. Pocky costs 90¢ a piece for a $1 price and was bought after no count.
select is((select name from public.insights_low_margin_items), 'Pocky', 'low margin item with stock bought since the last count');
select is((select bought_since from public.insights_low_margin_items), 10, 'and how many were bought');

-- Rules stay quiet with nothing to say.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select public.save_stock_count(format('[{"item_id":"%s","pieces":10}]',
  (select id from public.items where name = 'Pocky'))::jsonb);
select is((select count(*)::int from public.insights_low_margin_items), 0, 'counting the item clears the low margin rule');

select throws_like($$ select 1 / 0 $$, '%division by zero%', 'sanity: pgTAP still catching errors');
select is((select count(*)::int from public.insights_items where name = 'Pocky'), 0, 'one count is not enough for the item table');
select is((select count(*)::int from public.insights_months), 2, 'two months of data');

select * from finish();
rollback;
