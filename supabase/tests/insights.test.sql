-- What the Insights tab reads (pgTAP).
-- Run with: supabase test db
begin;
select plan(18);

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

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

-- Chips: 100 pieces, 50¢ each, $1. Gummies: 50 pieces, 20¢ each, $1.
select public.log_purchase('{
  "purchased_on": "2026-09-01", "store": "Costco",
  "buyer_id": "00000000-0000-0000-0000-00000000000a", "receipt_path": "r/a.jpg",
  "lines": [
    {"new_item": {"name": "Chips", "type": "snack"}, "pieces": 100, "cost_cents": 5000, "price_cents": 100},
    {"new_item": {"name": "Gummies", "type": "treat"}, "pieces": 50, "cost_cents": 1000, "price_cents": 100}
  ]}'::jsonb);

select is((select sale_days from public.insights_term), 0, 'no closed sale days yet');
select is((select sales_cents from public.insights_term), 0, 'empty term sells nothing');
select is((select margin_pct from public.insights_term), null, 'no margin without sales');

-- Day 1: chips only. Sold 30 = $30. Expected 3000 + 3000 - 100 credit = 5900; counted 5800 (short $1).
select public.create_sale_day('2026-09-10');
delete from public.sale_day_items;
insert into public.sale_day_items (sale_day_id, item_id)
select (select id from public.sale_days), id from public.items where name = 'Chips';
select public.start_sale((select id from public.sale_days));
select public.begin_count((select id from public.sale_days));
update public.sale_day_items set left_count = 70, out_count = 0;
update public.sale_days set helper_credits = 1, note = 'Chips went first.';
update public.cash_counts set qty = 2 where denom_cents = 2000;
update public.cash_counts set qty = 3 where denom_cents = 500;
update public.cash_counts set qty = 1 where denom_cents = 200;
update public.cash_counts set qty = 1 where denom_cents = 100;
select public.sign_off((select id from public.sale_days));
select public.close_sale_day((select id from public.sale_days));

select is((select sales_cents from public.insights_sale_days), 3000, 'day 1 sales');
select is((select cost_cents from public.insights_sale_days), 1500, 'day 1 stock cost: 30 chips at 50¢');
select is((select profit_cents from public.insights_sale_days), 1400, 'day 1 profit after cost and the helper credit');
select is((select over_short_cents from public.insights_sale_days), -100, 'day 1 over/short');
select is((select volunteers from public.insights_sale_days), 'Calvin', 'volunteers who signed off');
select is((select items_out from public.insights_sale_days), 1, 'items out');
select is((select outside_ok from public.insights_sale_days), false, '$1 short is within ±$3');

-- Day 2: chips and gummies. Chips sold 20 ($20), gummies sold 50 ($50, sold out). Credits 2.
-- Expected 3000 + 7000 - 200 = 9800; counted 9200 (short $6, outside ±$3).
select public.create_sale_day('2026-09-15');
delete from public.sale_day_items where sale_day_id = (select id from public.sale_days where phase = 'lineup');
insert into public.sale_day_items (sale_day_id, item_id)
select (select id from public.sale_days where phase = 'lineup'), id from public.items;
select public.start_sale((select id from public.sale_days where phase = 'lineup'));
select public.begin_count((select id from public.sale_days where phase = 'selling'));
update public.sale_day_items set left_count = case when item_id = (select id from public.items where name = 'Gummies') then 0 else 50 end, out_count = 0
 where sale_day_id = (select id from public.sale_days where phase = 'counting');
update public.sale_days set helper_credits = 2 where phase = 'counting';
update public.cash_counts set qty = 4 where denom_cents = 2000 and sale_day_id = (select id from public.sale_days where phase = 'counting');
update public.cash_counts set qty = 2 where denom_cents = 500 and sale_day_id = (select id from public.sale_days where phase = 'counting');
update public.cash_counts set qty = 1 where denom_cents = 200 and sale_day_id = (select id from public.sale_days where phase = 'counting');
select public.sign_off((select id from public.sale_days where phase = 'counting'));
select public.close_sale_day((select id from public.sale_days where phase = 'counting'));

select is((select sales_cents from public.insights_term), 10000, 'term sales');
select is((select profit_cents from public.insights_term), 10000 - (1500 + 1000 + 1000) - 300, 'term profit: sales less stock cost less helper credits');
select is((select over_short_cents from public.insights_term), -100 - 600, 'net over/short');
select is((select sales_outside_ok from public.insights_term), 1, 'one sale day outside ±$3');
select is((select pieces_per_day from public.insights_term), 50, 'items sold per sale day');

select is((select days_out from public.insights_items where name = 'Chips'), 2, 'chips were out both days');
select is((select pieces_per_day_out from public.insights_items where name = 'Chips'), 25, 'chips pieces per day out');
select is((select days_out from public.insights_items where name = 'Gummies'), 1, 'gummies only count the day they were out');

select * from finish();
rollback;
