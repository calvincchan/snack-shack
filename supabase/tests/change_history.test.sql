-- Change history for the item and sale day sheets (pgTAP).
-- Run with: supabase test db
begin;
select plan(8);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days, public.audit_log cascade;
alter table public.purchases alter column claim_no restart with 1;
update public.settings
   set float_cents = 3000, gst_rate = 0.05, treasurer_email = null;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com'),
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
    {"new_item": {"name": "BBQ chips", "type": "snack"}, "pieces": 30, "cost_cents": 1560, "price_cents": 100}
  ]}'::jsonb);

-- A test runs in one transaction, so now() never moves. Push the purchase back
-- an hour, as it would be in real life, before the edits below.
reset role;
update public.audit_log set at = at - interval '1 hour';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

-- Creating an item and buying stock is not a "change" ---------------------------
select is((select count(*)::int from public.change_history), 0, 'a new item has no history yet');

-- Item edits ---------------------------------------------------------------------
update public.items set price_cents = 200, bundle_size = 1, name = 'BBQ chips, big'
 where name = 'BBQ chips';

select is((select count(*)::int from public.change_history
            where item_id = (select id from public.items)), 2,
          'a price and a name change are two rows');
select is((select old_value || ' > ' || new_value from public.change_history where field = 'price'),
          '100/1 > 200/1', 'a price change keeps the old and new value');
select is((select actor_name from public.change_history where field = 'name'),
          'Yuki', 'the row names who changed it');
select is((select item_name from public.change_history where field = 'name'),
          'BBQ chips, big', 'the row carries the current item name');

-- The unit cost moves on every purchase; that is not history a volunteer made.
select is((select count(*)::int from public.change_history where field not in ('name', 'price')),
          0, 'unit cost and version bumps are not shown');

-- Sale day phases ------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.open_sale_day('2026-09-29');
update public.cash_counts set qty = 30 where kind = 'open' and denom_cents = 100;
select public.start_selling((select id from public.sale_days));
update public.cash_counts set qty = 5 where kind = 'close' and denom_cents = 2000;
select public.close_sale_day((select id from public.sale_days), 3000);

select is((select string_agg(new_value, ',' order by id) from public.change_history where field = 'phase'),
          'closed', 'closing a sale day is a row');
select is((select actor_name from public.change_history where field = 'phase'),
          'Calvin', 'the phase change names who closed it');

select * from finish();
rollback;
