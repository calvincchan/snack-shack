-- Snack Shack: initial schema (draft from the design handoff).
-- Read docs/DATA_MODEL.md first. Business maths lives here, not in the browser.
-- Money is integer cents. Stock is pieces. Unit cost is cents with 2 decimals.

-------------------------------------------------------------------------------
-- Types
-------------------------------------------------------------------------------
create type public.item_type       as enum ('snack', 'treat');
create type public.storage_kind    as enum ('shelf', 'freezer');
create type public.user_role       as enum ('volunteer', 'treasurer', 'admin');
create type public.sale_phase      as enum ('lineup', 'selling', 'counting', 'closed');
create type public.claim_status    as enum ('to_pay', 'paid');
create type public.check_reason    as enum ('missing', 'damaged');
create type public.movement_reason as enum
  ('purchase', 'sold', 'out', 'missing', 'damaged', 'found', 'donated', 'correction');

-------------------------------------------------------------------------------
-- Settings (single row)
-------------------------------------------------------------------------------
create table public.settings (
  id                    boolean primary key default true check (id),
  float_cents           int not null default 3000 check (float_cents >= 0),
  target_sale_days      int not null default 2 check (target_sale_days > 0),
  over_short_ok_cents   int not null default 300,
  over_short_warn_cents int not null default 1000,
  gst_rate              numeric(5,4) not null default 0.05,
  max_items_per_kid     int not null default 3,
  max_treats_per_kid    int not null default 1,
  treasurer_email       text,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
insert into public.settings default values;

-------------------------------------------------------------------------------
-- People
-------------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  role         public.user_role not null default 'volunteer',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Who is acting: the signed-in user, or the treasurer when an Edge Function
-- redeems a signed action link (it sets app.actor inside the transaction).
create function public.actor() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(auth.uid(), nullif(current_setting('app.actor', true), '')::uuid)
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create function public.has_role(r public.user_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = r)
$$;

-------------------------------------------------------------------------------
-- Items
-------------------------------------------------------------------------------
create table public.items (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  type            public.item_type not null,
  storage         public.storage_kind not null default 'shelf',
  -- null price = "Needs a price"; the item can't go in a lineup.
  price_cents     int,
  bundle_size     int not null default 1,
  unit_cost_cents numeric(10,2) not null default 0 check (unit_cost_cents >= 0),
  archived        boolean not null default false,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid default public.actor(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid default public.actor(),
  -- Price options: $1, $2, 2 for $1, 3 for $1 (decision P7). Widen here if needed.
  constraint items_price_option check (
    price_cents is null
    or (price_cents = 100 and bundle_size in (1, 2, 3))
    or (price_cents = 200 and bundle_size = 1)
  )
);

-------------------------------------------------------------------------------
-- Purchases = reimbursement claims
-------------------------------------------------------------------------------
create table public.purchases (
  id           uuid primary key default gen_random_uuid(),  -- client may supply (idempotent retries)
  claim_no     int generated always as identity unique,
  purchased_on date not null,
  store        text not null,
  buyer_id     uuid not null references public.profiles (id),
  receipt_path text not null,          -- object path in the private 'receipts' bucket
  status       public.claim_status not null default 'to_pay',
  paid_at      timestamptz,
  paid_by      uuid references public.profiles (id),
  payment_ref  text,
  created_at   timestamptz not null default now(),
  created_by   uuid default public.actor(),
  constraint purchases_paid_consistent check ((status = 'paid') = (paid_at is not null))
);

create table public.purchase_lines (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  line_no     int not null,
  item_id     uuid not null references public.items (id),
  pieces      int not null check (pieces > 0),
  cost_cents  int not null check (cost_cents > 0),   -- including tax
  unique (purchase_id, line_no)
);

-------------------------------------------------------------------------------
-- Sale days
-------------------------------------------------------------------------------
create table public.sale_days (
  id               uuid primary key default gen_random_uuid(),
  sale_date        date not null,
  phase            public.sale_phase not null default 'lineup',
  float_cents      int not null check (float_cents >= 0),
  helper_credits   int not null default 0 check (helper_credits >= 0),
  note             text,
  started_at       timestamptz,
  started_by       uuid,
  count_started_at timestamptz,
  closed_at        timestamptz,
  closed_by        uuid,
  created_at       timestamptz not null default now(),
  created_by       uuid default public.actor()
);
-- Only one sale day can be open at a time.
create unique index sale_days_one_open on public.sale_days ((true)) where phase <> 'closed';

create table public.sale_day_items (
  sale_day_id        uuid not null references public.sale_days (id) on delete cascade,
  item_id            uuid not null references public.items (id),
  -- Check stock (lineup phase). null = matches what the app expects.
  check_count        int check (check_count >= 0),
  check_reason       public.check_reason,
  -- Set by start_sale().
  start_count        int check (start_count >= 0),
  locked_price_cents int,
  locked_bundle_size int,
  locked_type        public.item_type,
  -- Count up (counting phase).
  left_count         int check (left_count >= 0),
  out_count          int not null default 0 check (out_count >= 0),
  updated_at         timestamptz not null default now(),
  updated_by         uuid default public.actor(),
  primary key (sale_day_id, item_id)
);

create table public.cash_counts (
  sale_day_id uuid not null references public.sale_days (id) on delete cascade,
  denom_cents int not null check (denom_cents in (2000, 1000, 500, 200, 100, 25, 10, 5)),
  qty         int not null default 0 check (qty >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default public.actor(),
  primary key (sale_day_id, denom_cents)
);

create table public.sale_day_signoffs (
  sale_day_id uuid not null references public.sale_days (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) default auth.uid(),
  signed_at   timestamptz not null default now(),
  primary key (sale_day_id, user_id)
);

-------------------------------------------------------------------------------
-- Stock ledger (append-only)
-------------------------------------------------------------------------------
create table public.stock_movements (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.items (id),
  qty              int not null check (qty <> 0),
  reason           public.movement_reason not null,
  purchase_line_id uuid references public.purchase_lines (id),
  sale_day_id      uuid references public.sale_days (id),
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid default public.actor(),
  constraint stock_movements_sign check (
    (reason in ('purchase', 'found') and qty > 0)
    or (reason in ('sold', 'out', 'missing', 'damaged', 'donated') and qty < 0)
    or reason = 'correction'
  )
);
create index on public.stock_movements (item_id);
create index on public.stock_movements (sale_day_id);

-------------------------------------------------------------------------------
-- Shopping trip claim ("I'm going shopping")
-------------------------------------------------------------------------------
create table public.shopping_trips (
  id           uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.profiles (id) default auth.uid(),
  planned_for  text,                        -- free text: "Thursday", "this weekend"
  created_at   timestamptz not null default now(),
  released_at  timestamptz
);
create unique index shopping_trips_one_open on public.shopping_trips ((true)) where released_at is null;

-------------------------------------------------------------------------------
-- Signed one-time action links for the treasurer email
-------------------------------------------------------------------------------
create table public.action_tokens (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,          -- sha256 hex of the random token; plaintext is never stored
  purpose    text not null check (purpose in ('mark_paid')),
  payload    jsonb not null,                -- {"buyer_id": "...", "purchase_ids": [...]}
  issued_to  uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- Audit log
-------------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_pk     text not null,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb,
  actor      uuid,
  at         timestamptz not null default now()
);
create index on public.audit_log (table_name, row_pk);

create function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pk_cols text[] := tg_argv;   -- primary key column names
  src jsonb := to_jsonb(coalesce(new, old));
  pk text;
begin
  select string_agg(src ->> c, ':') into pk from unnest(pk_cols) c;
  insert into public.audit_log (table_name, row_pk, action, old_data, new_data, actor)
  values (tg_table_name, pk, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          public.actor());
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on public.items
  for each row execute function public.audit_row('id');
create trigger audit after insert or update or delete on public.purchases
  for each row execute function public.audit_row('id');
create trigger audit after insert or update or delete on public.purchase_lines
  for each row execute function public.audit_row('id');
create trigger audit after insert or update or delete on public.sale_days
  for each row execute function public.audit_row('id');
create trigger audit after insert or update or delete on public.sale_day_items
  for each row execute function public.audit_row('sale_day_id', 'item_id');
create trigger audit after insert or update or delete on public.cash_counts
  for each row execute function public.audit_row('sale_day_id', 'denom_cents');
create trigger audit after insert or update or delete on public.sale_day_signoffs
  for each row execute function public.audit_row('sale_day_id', 'user_id');
create trigger audit after insert on public.stock_movements
  for each row execute function public.audit_row('id');
create trigger audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row('id');
create trigger audit after update on public.settings
  for each row execute function public.audit_row('id');

-------------------------------------------------------------------------------
-- Guard triggers
-------------------------------------------------------------------------------
-- Database functions below set snack.fn = 'on' for their transaction so they can
-- write columns that clients may not touch directly.
create function public.in_fn() returns boolean language sql stable as $$
  select coalesce(current_setting('snack.fn', true), '') = 'on'
$$;

-- Items: stamp updated_*, bump version, and support optimistic concurrency:
-- clients send the version they loaded; update with `.eq('version', loaded)`.
create function public.items_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := public.actor();
  new.version    := old.version + 1;
  return new;
end $$;
create trigger items_touch before update on public.items
  for each row execute function public.items_touch();

-- Stock ledger is append-only.
create function public.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% rows cannot be changed. Add a correction instead.', tg_table_name;
end $$;
create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function public.forbid_change();

-- Sale day header: phase and timestamps only via functions; helper credits and
-- note only while counting; nothing once closed.
create function public.sale_days_guard() returns trigger language plpgsql as $$
begin
  if public.in_fn() then return new; end if;
  if old.phase = 'closed' then
    raise exception 'This sale day is closed. Fix mistakes with a stock correction.';
  end if;
  if (new.phase, new.float_cents, new.started_at, new.started_by, new.count_started_at,
      new.closed_at, new.closed_by, new.sale_date)
     is distinct from
     (old.phase, old.float_cents, old.started_at, old.started_by, old.count_started_at,
      old.closed_at, old.closed_by, old.sale_date) then
    raise exception 'Use the sale day functions to change phase.';
  end if;
  if (new.helper_credits, new.note) is distinct from (old.helper_credits, old.note)
     and old.phase <> 'counting' then
    raise exception 'Helper credits and notes are entered during count-up.';
  end if;
  return new;
end $$;
create trigger sale_days_guard before update on public.sale_days
  for each row execute function public.sale_days_guard();

-- Lineup rows: add/remove and Check stock only during lineup; counts only during counting.
create function public.sale_day_items_guard() returns trigger language plpgsql as $$
declare
  ph public.sale_phase;
begin
  select phase into ph from public.sale_days where id = coalesce(new.sale_day_id, old.sale_day_id);
  if public.in_fn() then return coalesce(new, old); end if;
  if tg_op in ('INSERT', 'DELETE') then
    if ph <> 'lineup' then raise exception 'The lineup can only change before the sale starts.'; end if;
    if tg_op = 'INSERT' and exists (select 1 from public.items
                                     where id = new.item_id and (price_cents is null or archived)) then
      raise exception 'Only priced, active items can go in a lineup.';
    end if;
    return coalesce(new, old);
  end if;
  if (new.start_count, new.locked_price_cents, new.locked_bundle_size, new.locked_type)
     is distinct from (old.start_count, old.locked_price_cents, old.locked_bundle_size, old.locked_type) then
    raise exception 'Starting counts and locked prices are set by start_sale().';
  end if;
  if (new.check_count, new.check_reason) is distinct from (old.check_count, old.check_reason)
     and ph <> 'lineup' then
    raise exception 'Check stock happens before the sale starts.';
  end if;
  if (new.left_count, new.out_count) is distinct from (old.left_count, old.out_count)
     and ph <> 'counting' then
    raise exception 'Leftover counts are entered during count-up.';
  end if;
  new.updated_at := now();
  new.updated_by := public.actor();
  return new;
end $$;
create trigger sale_day_items_guard before insert or update or delete on public.sale_day_items
  for each row execute function public.sale_day_items_guard();

create function public.cash_counts_guard() returns trigger language plpgsql as $$
declare
  ph public.sale_phase;
begin
  select phase into ph from public.sale_days where id = coalesce(new.sale_day_id, old.sale_day_id);
  if public.in_fn() then return coalesce(new, old); end if;
  if ph <> 'counting' then raise exception 'Cash is counted during count-up.'; end if;
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    new.updated_by := public.actor();
  end if;
  return coalesce(new, old);
end $$;
create trigger cash_counts_guard before insert or update or delete on public.cash_counts
  for each row execute function public.cash_counts_guard();

-- Any change to counts after someone signed off clears the sign-offs, so both
-- volunteers always confirm the final numbers.
create function public.clear_signoffs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.in_fn() then return null; end if;
  delete from public.sale_day_signoffs where sale_day_id = coalesce(new.sale_day_id, old.sale_day_id);
  return null;
end $$;
create trigger clear_signoffs after insert or update or delete on public.sale_day_items
  for each row execute function public.clear_signoffs();
create trigger clear_signoffs after insert or update or delete on public.cash_counts
  for each row execute function public.clear_signoffs();

create function public.sale_days_clear_signoffs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.in_fn() then return null; end if;
  if (new.helper_credits) is distinct from (old.helper_credits) then
    delete from public.sale_day_signoffs where sale_day_id = new.id;
  end if;
  return null;
end $$;
create trigger clear_signoffs after update on public.sale_days
  for each row execute function public.sale_days_clear_signoffs();

-------------------------------------------------------------------------------
-- Views (security_invoker so RLS applies)
-------------------------------------------------------------------------------
create view public.item_stock with (security_invoker = true) as
select i.*,
       coalesce(sum(m.qty), 0)::int as on_hand
from public.items i
left join public.stock_movements m on m.item_id = i.id
group by i.id;

create view public.claims with (security_invoker = true) as
select p.*,
       'SS-' || lpad(p.claim_no::text, 3, '0') as claim_label,
       (select coalesce(sum(l.cost_cents), 0) from public.purchase_lines l where l.purchase_id = p.id)::int as total_cents,
       pr.display_name as buyer_name
from public.purchases p
join public.profiles pr on pr.id = p.buyer_id;

create view public.sale_day_item_results with (security_invoker = true) as
select sdi.*,
       sd.sale_date,
       sd.phase,
       (sdi.start_count - sdi.left_count - sdi.out_count) as sold_pieces,
       round((sdi.start_count - sdi.left_count - sdi.out_count)::numeric
             * sdi.locked_price_cents / sdi.locked_bundle_size)::int as sales_cents
from public.sale_day_items sdi
join public.sale_days sd on sd.id = sdi.sale_day_id;

create view public.sale_day_totals with (security_invoker = true) as
with r as (
  select sale_day_id,
         coalesce(sum(greatest(sold_pieces, 0)), 0)::int as pieces_sold,
         coalesce(sum(greatest(sold_pieces, 0)) filter (where locked_type = 'treat'), 0)::int as treat_pieces_sold,
         coalesce(sum(greatest(sales_cents, 0)), 0)::int as sales_cents,
         count(*) filter (where sold_pieces < 0)::int as items_over_start,
         count(*) filter (where left_count is null)::int as items_uncounted
  from public.sale_day_item_results
  group by sale_day_id
), c as (
  select sale_day_id, sum(denom_cents * qty)::int as counted_cents
  from public.cash_counts group by sale_day_id
)
select sd.id as sale_day_id,
       sd.sale_date,
       sd.phase,
       sd.float_cents,
       sd.helper_credits,
       coalesce(r.pieces_sold, 0) as pieces_sold,
       coalesce(r.treat_pieces_sold, 0) as treat_pieces_sold,
       coalesce(r.sales_cents, 0) as sales_cents,
       coalesce(r.items_over_start, 0) as items_over_start,
       coalesce(r.items_uncounted, 0) as items_uncounted,
       sd.float_cents + coalesce(r.sales_cents, 0) - sd.helper_credits * 100 as expected_cents,
       coalesce(c.counted_cents, 0) as counted_cents,
       coalesce(c.counted_cents, 0) - (sd.float_cents + coalesce(r.sales_cents, 0) - sd.helper_credits * 100) as over_short_cents,
       coalesce(c.counted_cents, 0) - sd.float_cents as deposit_cents,
       (select count(*) from public.sale_day_signoffs s where s.sale_day_id = sd.id)::int as signoffs
from public.sale_days sd
left join r on r.sale_day_id = sd.id
left join c on c.sale_day_id = sd.id;

-- Per-item history across closed sale days (feeds lineup suggestions, Deal check, Insights).
create view public.item_sale_stats with (security_invoker = true) as
with closed as (
  select id, row_number() over (order by sale_date desc, closed_at desc) as rn
  from public.sale_days where phase = 'closed'
), r as (
  select res.item_id, res.sold_pieces, res.left_count, c.rn
  from public.sale_day_item_results res
  join closed c on c.id = res.sale_day_id
)
select i.id as item_id,
       i.type,
       count(r.rn)::int as days_out,
       coalesce(sum(r.sold_pieces), 0)::int as pieces_sold,
       case when count(r.rn) > 0 then sum(r.sold_pieces)::numeric / count(r.rn) end as pieces_per_day_out,
       (min(r.rn) - 1)::int as sales_since_out,           -- 0 = out at the last sale; null = never
       coalesce(bool_or(r.left_count = 0 and r.rn <= 2), false) as sold_out_recently,
       count(r.rn) filter (where r.left_count = 0)::int as sold_out_days
from public.items i
left join r on r.item_id = i.id
group by i.id, i.type;

-------------------------------------------------------------------------------
-- Functions
-------------------------------------------------------------------------------
create function public.require_member() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'Not signed in as a Snack Shack volunteer.'; end if;
end $$;

-- Lineup suggestion (HANDOFF §5.6): top 3 snacks + top 2 treats.
create function public.suggest_lineup()
returns table (item_id uuid, type public.item_type, score int, reason text, suggested boolean)
language sql stable security invoker set search_path = '' as $$
  with s as (
    select st.*, i.on_hand
    from public.item_sale_stats st
    join public.item_stock i on i.id = st.item_id
    where i.price_cents is not null and not i.archived and i.on_hand > 0
  ), avg_rate as (
    select type, avg(pieces_per_day_out) as rate from s where pieces_per_day_out is not null group by type
  ), scored as (
    select s.item_id, s.type,
           (s.days_out = 0) as is_new,
           s.sold_out_recently as sold_out,
           coalesce(s.pieces_per_day_out < 0.6 * a.rate, false) as slow,
           s.sales_since_out
    from s left join avg_rate a on a.type = s.type
  ), ranked as (
    select *,
           (40 * is_new::int + 30 * sold_out::int + 35 * slow::int
            + 10 * least(coalesce(sales_since_out, 5), 5)) as score
    from scored
  ), picked as (
    select *, row_number() over (partition by type order by score desc, item_id) as rk from ranked
  )
  select item_id, type, score,
         case when is_new then 'New'
              when sold_out then 'Sold out lately'
              when slow then 'Slow seller'
              when sales_since_out >= 2 then 'Not out for ' || sales_since_out || ' sales'
         end,
         rk <= case when type = 'snack' then 3 else 2 end
  from picked
  order by type, score desc
$$;

-- Create today's sale day with the suggested lineup.
create function public.create_sale_day(p_date date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  insert into public.sale_days (sale_date, float_cents)
  select p_date, float_cents from public.settings
  returning id into v_id;
  insert into public.sale_day_items (sale_day_id, item_id)
  select v_id, s.item_id from public.suggest_lineup() s where s.suggested;
  perform set_config('snack.fn', '', true);
  return v_id;
end $$;

-- Start sale: record Check stock differences, lock prices and types, open selling.
create function public.start_sale(p_sale_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_diff int;
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set phase = 'selling', started_at = now(), started_by = auth.uid()
   where id = p_sale_day and phase = 'lineup';
  if not found then raise exception 'This sale has already started.'; end if;
  if not exists (select 1 from public.sale_day_items where sale_day_id = p_sale_day) then
    raise exception 'Pick at least one item for the lineup.';
  end if;

  for r in
    select sdi.item_id, sdi.check_count, sdi.check_reason, i.on_hand, i.price_cents, i.bundle_size, i.type, i.name
    from public.sale_day_items sdi
    join public.item_stock i on i.id = sdi.item_id
    where sdi.sale_day_id = p_sale_day
  loop
    if r.price_cents is null then raise exception '% needs a price before it can be sold.', r.name; end if;
    v_diff := coalesce(r.check_count, r.on_hand) - r.on_hand;
    if v_diff < 0 then
      insert into public.stock_movements (item_id, qty, reason, sale_day_id)
      values (r.item_id, v_diff, coalesce(r.check_reason, 'missing')::text::public.movement_reason, p_sale_day);
    elsif v_diff > 0 then
      insert into public.stock_movements (item_id, qty, reason, sale_day_id)
      values (r.item_id, v_diff, 'found', p_sale_day);
    end if;
    update public.sale_day_items
       set start_count = r.on_hand + v_diff,
           locked_price_cents = r.price_cents,
           locked_bundle_size = r.bundle_size,
           locked_type = r.type
     where sale_day_id = p_sale_day and item_id = r.item_id;
  end loop;
  perform set_config('snack.fn', '', true);
end $$;

-- "Sale's over: count up". Pre-fills leftover counts with the starting counts.
create function public.begin_count(p_sale_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  update public.sale_days set phase = 'counting', count_started_at = now()
   where id = p_sale_day and phase = 'selling';
  if not found then raise exception 'Count-up has already started.'; end if;
  update public.sale_day_items set left_count = start_count
   where sale_day_id = p_sale_day and left_count is null;
  insert into public.cash_counts (sale_day_id, denom_cents)
  select p_sale_day, d from unnest(array[2000, 1000, 500, 200, 100, 25, 10, 5]) d
  on conflict do nothing;
  perform set_config('snack.fn', '', true);
end $$;

create function public.sign_off(p_sale_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member();
  if not exists (select 1 from public.sale_days where id = p_sale_day and phase = 'counting') then
    raise exception 'Sign-off happens during count-up.';
  end if;
  insert into public.sale_day_signoffs (sale_day_id, user_id) values (p_sale_day, auth.uid())
  on conflict do nothing;
end $$;

-- Finish count-up: needs two different volunteers, no item above its start.
create function public.close_sale_day(p_sale_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  perform public.require_member();
  select * into t from public.sale_day_totals where sale_day_id = p_sale_day;
  if t.phase is distinct from 'counting' then raise exception 'This sale day is not being counted.'; end if;
  if t.signoffs < 2 then raise exception 'Two different volunteers need to sign off.'; end if;
  if t.items_over_start > 0 then raise exception 'Some items show more left than you started with. Recount them.'; end if;
  if t.items_uncounted > 0 then raise exception 'Some items have no leftover count.'; end if;

  perform set_config('snack.fn', 'on', true);
  update public.sale_days set phase = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_sale_day and phase = 'counting';
  if not found then raise exception 'This sale day was already finished.'; end if;

  insert into public.stock_movements (item_id, qty, reason, sale_day_id)
  select item_id, -sold_pieces, 'sold', p_sale_day
  from public.sale_day_item_results where sale_day_id = p_sale_day and sold_pieces > 0;
  insert into public.stock_movements (item_id, qty, reason, sale_day_id)
  select item_id, -out_count, 'out', p_sale_day
  from public.sale_day_items where sale_day_id = p_sale_day and out_count > 0;
  perform set_config('snack.fn', '', true);
end $$;

-- Log a receipt: one transaction creates the claim, any new items, lines,
-- stock movements, and updates weighted-average cost. Idempotent on p->>'id'.
--
-- p = {
--   "id": uuid (optional, client-generated), "purchased_on": "2026-09-26", "store": "Costco",
--   "buyer_id": uuid, "receipt_path": "…",
--   "lines": [
--     { "item_id": uuid | null,
--       "new_item": { "name": "…", "type": "treat", "storage": "shelf" } | null,
--       "pieces": 130, "cost_cents": 1799,
--       "price_cents": 100 | null, "bundle_size": 2 | null }    -- null price = keep / decide later
--   ]
-- }
create function public.log_purchase(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_line jsonb;
  v_n int := 0;
  v_item uuid;
  v_on_hand int;
  v_cost numeric;
  v_line_id uuid;
begin
  perform public.require_member();
  if exists (select 1 from public.purchases where id = v_id) then return v_id; end if;
  if coalesce(p ->> 'receipt_path', '') = '' then raise exception 'Attach the receipt photo.'; end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]')) = 0 then raise exception 'Add at least one item.'; end if;

  insert into public.purchases (id, purchased_on, store, buyer_id, receipt_path)
  values (v_id, (p ->> 'purchased_on')::date, p ->> 'store', (p ->> 'buyer_id')::uuid, p ->> 'receipt_path');

  for v_line in select * from jsonb_array_elements(p -> 'lines') loop
    v_n := v_n + 1;
    v_item := (v_line ->> 'item_id')::uuid;
    if v_item is null then
      insert into public.items (name, type, storage)
      values (trim(v_line -> 'new_item' ->> 'name'),
              (v_line -> 'new_item' ->> 'type')::public.item_type,
              coalesce((v_line -> 'new_item' ->> 'storage')::public.storage_kind, 'shelf'))
      returning id into v_item;
    end if;

    select on_hand, unit_cost_cents into v_on_hand, v_cost from public.item_stock where id = v_item;
    v_on_hand := greatest(v_on_hand, 0);
    update public.items
       set unit_cost_cents = round(((v_on_hand * v_cost) + (v_line ->> 'cost_cents')::int)
                                   / (v_on_hand + (v_line ->> 'pieces')::int), 2),
           price_cents = coalesce((v_line ->> 'price_cents')::int, price_cents),
           bundle_size = case when v_line ->> 'price_cents' is not null
                              then coalesce((v_line ->> 'bundle_size')::int, 1) else bundle_size end
     where id = v_item;

    insert into public.purchase_lines (purchase_id, line_no, item_id, pieces, cost_cents)
    values (v_id, v_n, v_item, (v_line ->> 'pieces')::int, (v_line ->> 'cost_cents')::int)
    returning id into v_line_id;
    insert into public.stock_movements (item_id, qty, reason, purchase_line_id)
    values (v_item, (v_line ->> 'pieces')::int, 'purchase', v_line_id);
  end loop;
  return v_id;
end $$;

-- Weekly email: issue one "Mark paid" token per volunteer owed money.
-- Called by the Edge Function with the service role. Returns plaintext tokens
-- once; only their hashes are stored.
create function public.issue_mark_paid_tokens(p_valid interval default interval '7 days')
returns table (buyer_id uuid, buyer_name text, total_cents int, purchase_ids uuid[], token text)
language plpgsql security definer set search_path = '' as $$
declare
  v_treasurer uuid;
  r record;
  v_token text;
begin
  select id into v_treasurer from public.profiles where role = 'treasurer' and active limit 1;
  if v_treasurer is null then raise exception 'No active treasurer account.'; end if;
  for r in
    select c.buyer_id, c.buyer_name, sum(c.total_cents)::int as total, array_agg(c.id order by c.claim_no) as ids
    from public.claims c where c.status = 'to_pay'
    group by c.buyer_id, c.buyer_name
  loop
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.action_tokens (token_hash, purpose, payload, issued_to, expires_at)
    values (encode(extensions.digest(v_token, 'sha256'), 'hex'), 'mark_paid',
            jsonb_build_object('buyer_id', r.buyer_id, 'purchase_ids', to_jsonb(r.ids)),
            v_treasurer, now() + p_valid);
    buyer_id := r.buyer_id; buyer_name := r.buyer_name; total_cents := r.total;
    purchase_ids := r.ids; token := v_token;
    return next;
  end loop;
end $$;

-- Redeem a "Mark paid" link. Called by the Edge Function (service role).
-- Records the payment as the treasurer the token was issued to.
create function public.redeem_action_token(p_token text, p_payment_ref text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.action_tokens;
  v_count int;
begin
  select * into t from public.action_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if t.id is null then raise exception 'This link is not valid.'; end if;
  if t.used_at is not null then raise exception 'This link has already been used.'; end if;
  if t.expires_at < now() then raise exception 'This link has expired. Use the latest weekly email.'; end if;

  perform set_config('app.actor', t.issued_to::text, true);
  update public.purchases
     set status = 'paid', paid_at = now(), paid_by = t.issued_to,
         payment_ref = coalesce(p_payment_ref, 'E-transfer')
   where id in (select jsonb_array_elements_text(t.payload -> 'purchase_ids')::uuid)
     and status = 'to_pay';
  get diagnostics v_count = row_count;
  update public.action_tokens set used_at = now() where id = t.id;
  return jsonb_build_object('purchases_paid', v_count, 'buyer_id', t.payload ->> 'buyer_id');
end $$;

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.settings          enable row level security;
alter table public.profiles          enable row level security;
alter table public.items             enable row level security;
alter table public.purchases         enable row level security;
alter table public.purchase_lines    enable row level security;
alter table public.sale_days         enable row level security;
alter table public.sale_day_items    enable row level security;
alter table public.cash_counts       enable row level security;
alter table public.sale_day_signoffs enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.shopping_trips    enable row level security;
alter table public.action_tokens     enable row level security;   -- no policies: service role only
alter table public.audit_log         enable row level security;

-- Every active member can read everything operational.
create policy read_all on public.settings          for select to authenticated using (public.is_member());
create policy read_all on public.profiles          for select to authenticated using (public.is_member());
create policy read_all on public.items             for select to authenticated using (public.is_member());
create policy read_all on public.purchases         for select to authenticated using (public.is_member());
create policy read_all on public.purchase_lines    for select to authenticated using (public.is_member());
create policy read_all on public.sale_days         for select to authenticated using (public.is_member());
create policy read_all on public.sale_day_items    for select to authenticated using (public.is_member());
create policy read_all on public.cash_counts       for select to authenticated using (public.is_member());
create policy read_all on public.sale_day_signoffs for select to authenticated using (public.is_member());
create policy read_all on public.stock_movements   for select to authenticated using (public.is_member());
create policy read_all on public.shopping_trips    for select to authenticated using (public.is_member());
create policy read_all on public.audit_log         for select to authenticated using (public.is_member());

-- Admin manages people and settings.
create policy admin_write on public.profiles for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_write on public.settings for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Items: any member edits (Items tab). Creation normally happens in log_purchase().
create policy member_write on public.items for insert to authenticated with check (public.is_member());
create policy member_write_u on public.items for update to authenticated using (public.is_member()) with check (public.is_member());

-- Sale day rows: members write; guard triggers enforce the phase rules.
create policy member_write on public.sale_days for update to authenticated using (public.is_member()) with check (public.is_member());
create policy member_write on public.sale_day_items for all to authenticated using (public.is_member()) with check (public.is_member());
create policy member_write on public.cash_counts for all to authenticated using (public.is_member()) with check (public.is_member());

-- Stock: clients may only add donations and corrections directly.
create policy member_insert on public.stock_movements for insert to authenticated
  with check (public.is_member() and reason in ('donated', 'correction'));

-- Shopping trips: claim your own, release your own.
create policy member_insert on public.shopping_trips for insert to authenticated
  with check (public.is_member() and volunteer_id = auth.uid());
create policy member_release on public.shopping_trips for update to authenticated
  using (volunteer_id = auth.uid()) with check (volunteer_id = auth.uid());

-- Purchases, lines, sign-offs and status changes go through functions only (no direct write policies).

-------------------------------------------------------------------------------
-- Grants on functions
-------------------------------------------------------------------------------
revoke execute on function public.issue_mark_paid_tokens(interval) from public, anon, authenticated;
revoke execute on function public.redeem_action_token(text, text) from public, anon, authenticated;
grant execute on function public.issue_mark_paid_tokens(interval) to service_role;
grant execute on function public.redeem_action_token(text, text) to service_role;

-------------------------------------------------------------------------------
-- Realtime (Sale day screen only)
-------------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.sale_days, public.sale_day_items, public.cash_counts, public.sale_day_signoffs;
