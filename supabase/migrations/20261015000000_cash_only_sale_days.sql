-- Sale days count cash only (ADR-0015). A sale day is two cash counts:
-- the box when it opens and again when it closes, plus what is left in the
-- box for next time. The lineup, Check stock, the item count up, locked
-- prices, helper credits, over/short and the kid rules are gone.
--
-- Production had no sale days when this ran (backed up 2026-10-15), so the
-- old sale day tables are dropped rather than migrated. Stock movements keep
-- their sale_day_id column for history, without the foreign key.

-- 1. Everything that read the old sale day tables.
drop view if exists
  public.insights_check_stock_losses,
  public.insights_fading_items,
  public.insights_items,
  public.insights_sale_days,
  public.insights_slowest_item,
  public.insights_sold_out_items,
  public.insights_term,
  public.insights_treat_share,
  public.type_benchmarks,
  public.stock_by_type,
  public.sale_day_lineup_totals,
  public.sale_day_lineup,
  public.lineup_options,
  public.item_overview,
  public.item_sale_stats,
  public.sale_day_totals,
  public.sale_day_item_results;

drop function if exists
  public.suggest_lineup(),
  public.create_sale_day(date),
  public.start_sale(uuid, integer),
  public.begin_count(uuid),
  public.sign_off(uuid),
  public.close_sale_day(uuid);

alter table public.stock_movements drop constraint if exists stock_movements_sale_day_id_fkey;

drop table if exists
  public.sale_day_signoffs,
  public.sale_day_items,
  public.cash_counts,
  public.sale_days;

drop function if exists
  public.cash_counts_guard(),
  public.clear_signoffs(),
  public.sale_day_items_guard(),
  public.sale_days_clear_signoffs(),
  public.sale_days_guard();

drop type public.sale_phase;

-- 2. Settings the kid rules, target stock and over/short used.
alter table public.settings
  drop column target_sale_days,
  drop column over_short_ok_cents,
  drop column over_short_warn_cents,
  drop column max_items_per_kid,
  drop column max_treats_per_kid;

-- 3. The new sale day.
create type public.sale_phase as enum ('open', 'closed');
create type public.cash_count_kind as enum ('open', 'close');

create table public.sale_days (
  id                uuid primary key default gen_random_uuid(),
  sale_date         date not null unique,
  phase             public.sale_phase not null default 'open',
  open_note         text,
  close_note        text,
  selling_at        timestamptz,          -- open count saved; set by start_selling
  selling_by        uuid references public.profiles (id),
  left_in_box_cents int check (left_in_box_cents >= 0),
  closed_at         timestamptz,
  closed_by         uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  created_by        uuid default public.actor() references public.profiles (id)
);
-- Only one sale day open at a time.
create unique index sale_days_one_open on public.sale_days (phase) where phase = 'open';

create table public.cash_counts (
  sale_day_id uuid not null references public.sale_days (id) on delete cascade,
  kind        public.cash_count_kind not null,
  denom_cents int not null check (denom_cents in (2000, 1000, 500, 200, 100, 25, 10, 5)),
  qty         int not null default 0 check (qty >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default public.actor(),
  primary key (sale_day_id, kind, denom_cents)
);

-- Counts change only while the sale day is open: the open count until
-- selling starts, the close count after. Functions bypass this.
create function public.cash_counts_guard() returns trigger
language plpgsql as $$
declare
  d public.sale_days;
begin
  if public.in_fn() then return coalesce(new, old); end if;
  if tg_op <> 'UPDATE' then raise exception 'Cash rows are created with the sale day.'; end if;
  if (new.sale_day_id, new.kind, new.denom_cents) is distinct from (old.sale_day_id, old.kind, old.denom_cents) then
    raise exception 'Only the count can change.';
  end if;
  select * into d from public.sale_days where id = new.sale_day_id;
  if d.phase <> 'open' then raise exception 'This sale day is closed.'; end if;
  if new.kind = 'open' and d.selling_at is not null then
    raise exception 'Selling has started. The open count can''t change.';
  end if;
  if new.kind = 'close' and d.selling_at is null then
    raise exception 'Finish the open count first.';
  end if;
  new.updated_at := now();
  new.updated_by := public.actor();
  return new;
end $$;

create trigger cash_counts_guard before insert or update or delete on public.cash_counts
  for each row execute function public.cash_counts_guard();

create trigger audit after insert or update or delete on public.sale_days
  for each row execute function public.audit_row('id');
create trigger audit after insert or update or delete on public.cash_counts
  for each row execute function public.audit_row('sale_day_id');

alter table public.sale_days enable row level security;
alter table public.cash_counts enable row level security;
create policy read_all on public.sale_days for select to authenticated using (public.is_member());
create policy read_all on public.cash_counts for select to authenticated using (public.is_member());
-- Sale day rows change only through the functions below; counts are
-- written directly, one row at a time, guarded by the trigger above.
create policy member_write on public.cash_counts for update to authenticated
  using (public.is_member()) with check (public.is_member());

grant select, insert, update, delete on public.sale_days, public.cash_counts to authenticated, service_role;

alter publication supabase_realtime add table public.sale_days, public.cash_counts;

-- 4. Functions: the only way a sale day changes phase.

create function public.local_today() returns date
language sql stable as $$
  select (now() at time zone 'America/Vancouver')::date
$$;

create function public.open_sale_day(p_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_date, public.local_today());
  v_id uuid;
begin
  perform public.require_member();
  if v_date > public.local_today() then raise exception 'A sale day can''t be in the future.'; end if;
  if exists (select 1 from public.sale_days where phase = 'open') then
    raise exception 'Another sale day is still open. Close it first.';
  end if;
  if exists (select 1 from public.sale_days where sale_date = v_date) then
    raise exception 'There''s already a sale day on %.', to_char(v_date, 'FMMon FMDD');
  end if;

  perform set_config('snack.fn', 'on', true);
  insert into public.sale_days (sale_date) values (v_date) returning id into v_id;
  insert into public.cash_counts (sale_day_id, kind, denom_cents)
  select v_id, k, d
    from unnest(array['open', 'close']::public.cash_count_kind[]) k,
         unnest(array[2000, 1000, 500, 200, 100, 25, 10, 5]) d;
  perform set_config('snack.fn', '', true);
  return v_id;
exception when unique_violation then
  raise exception 'Another sale day was just opened. Refresh and try again.';
end $$;

-- Only before selling starts, for a sale day opened by mistake.
create function public.cancel_sale_day(p_sale_day uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  delete from public.sale_days where id = p_sale_day and phase = 'open' and selling_at is null;
  if not found then raise exception 'Selling has started, so this sale day can''t be cancelled.'; end if;
  perform set_config('snack.fn', '', true);
end $$;

create function public.start_selling(p_sale_day uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member();
  if not exists (select 1 from public.cash_counts where sale_day_id = p_sale_day and kind = 'open' and qty > 0) then
    raise exception 'Count the cash box first.';
  end if;
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set selling_at = now(), selling_by = auth.uid(), open_note = nullif(btrim(p_note), '')
   where id = p_sale_day and phase = 'open' and selling_at is null;
  if not found then raise exception 'Selling has already started.'; end if;
  perform set_config('snack.fn', '', true);
end $$;

create function public.close_sale_day(p_sale_day uuid, p_left_in_box_cents int, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_close int;
begin
  perform public.require_member();
  if exists (select 1 from public.sale_days where id = p_sale_day and phase = 'closed') then
    raise exception 'This sale day was already closed.';
  end if;
  if not exists (select 1 from public.sale_days where id = p_sale_day and selling_at is not null) then
    raise exception 'Finish the open count first.';
  end if;
  select coalesce(sum(denom_cents * qty), 0) into v_close
    from public.cash_counts where sale_day_id = p_sale_day and kind = 'close';
  if v_close = 0 then raise exception 'Count the cash box first.'; end if;
  if p_left_in_box_cents is null or p_left_in_box_cents < 0 then
    raise exception 'Left in box can''t be negative.';
  end if;
  if p_left_in_box_cents > v_close then
    raise exception 'Left in box is more than you counted.';
  end if;

  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set phase = 'closed', closed_at = now(), closed_by = auth.uid(),
         left_in_box_cents = p_left_in_box_cents, close_note = nullif(btrim(p_note), '')
   where id = p_sale_day and phase = 'open';
  if not found then raise exception 'This sale day was already closed.'; end if;
  perform set_config('snack.fn', '', true);
end $$;

-- 5. The numbers per sale day.
create view public.sale_day_cash with (security_invoker = true) as
with totals as (
  select sale_day_id,
         sum(denom_cents * qty) filter (where kind = 'open')::int  as open_cents,
         sum(denom_cents * qty) filter (where kind = 'close')::int as close_cents
    from public.cash_counts group by sale_day_id
)
select d.id as sale_day_id,
       d.sale_date,
       d.phase,
       d.selling_at,
       d.closed_at,
       t.open_cents,
       t.close_cents,
       (t.close_cents - t.open_cents) as revenue_cents,
       d.left_in_box_cents,
       (t.close_cents - d.left_in_box_cents) as deposit_cents,
       prev.left_in_box_cents as expected_open_cents,
       (t.open_cents - prev.left_in_box_cents) as open_diff_cents,
       d.open_note,
       d.close_note,
       sb.display_name as opened_by_name,
       cb.display_name as closed_by_name
  from public.sale_days d
  join totals t on t.sale_day_id = d.id
  left join lateral (
    select p.left_in_box_cents from public.sale_days p
     where p.phase = 'closed' and p.sale_date < d.sale_date
     order by p.sale_date desc limit 1) prev on true
  left join public.profiles sb on sb.id = d.selling_by
  left join public.profiles cb on cb.id = d.closed_by;

-- 6. Rebuilt without sale day stats.
create view public.item_overview with (security_invoker = true) as
select s.*,
       (s.created_at > now() - interval '30 days') as is_new,
       last_buy.buyer_name as last_bought_by,
       last_buy.purchased_on as last_bought_on,
       editor.display_name as updated_by_name
  from public.item_stock s
  left join lateral (
    select pr.display_name as buyer_name, p.purchased_on
      from public.purchase_lines l
      join public.purchases p on p.id = l.purchase_id
      join public.profiles pr on pr.id = p.buyer_id
     where l.item_id = s.id
     order by p.purchased_on desc, p.claim_no desc
     limit 1) last_buy on true
  left join public.profiles editor on editor.id = s.updated_by;

-- Deal check: what a piece usually costs. The selling-speed half is gone.
create view public.type_benchmarks with (security_invoker = true) as
select t.type,
       coalesce(
         (select avg(i.unit_cost_cents) from public.item_overview i
           where i.type = t.type and not i.archived and not i.is_new
             and i.price_cents is not null and i.unit_cost_cents > 0),
         (select avg(i.unit_cost_cents) from public.item_overview i
           where i.type = t.type and not i.archived
             and i.price_cents is not null and i.unit_cost_cents > 0)) as usual_cost_cents
  from (values ('snack'::public.item_type), ('treat'::public.item_type)) t (type);

-- Change history: item edits and sale day phases. Lineup counts are gone.
create or replace view public.change_history with (security_invoker = true) as
with changes as (
  select a.id, a.at, a.actor,
         (a.new_data ->> 'id')::uuid as item_id,
         null::uuid as sale_day_id,
         f.field,
         a.old_data ->> f.field as old_value,
         a.new_data ->> f.field as new_value
    from public.audit_log a
    cross join (values ('name'), ('type'), ('storage'), ('archived')) f (field)
   where a.table_name = 'items' and a.action = 'UPDATE'
     and (a.old_data ->> f.field) is distinct from (a.new_data ->> f.field)
     and not exists (select 1 from public.audit_log b
                      where b.table_name = 'items' and b.action = 'INSERT'
                        and b.row_pk = a.row_pk and b.at = a.at)
  union all
  select a.id, a.at, a.actor,
         (a.new_data ->> 'id')::uuid, null::uuid,
         'price',
         (a.old_data ->> 'price_cents') || '/' || (a.old_data ->> 'bundle_size'),
         (a.new_data ->> 'price_cents') || '/' || (a.new_data ->> 'bundle_size')
    from public.audit_log a
   where a.table_name = 'items' and a.action = 'UPDATE'
     and ((a.old_data ->> 'price_cents') is distinct from (a.new_data ->> 'price_cents')
       or (a.old_data ->> 'bundle_size') is distinct from (a.new_data ->> 'bundle_size'))
     and not exists (select 1 from public.audit_log b
                      where b.table_name = 'items' and b.action = 'INSERT'
                        and b.row_pk = a.row_pk and b.at = a.at)
  union all
  select a.id, a.at, a.actor,
         null::uuid, (a.new_data ->> 'id')::uuid,
         'phase', a.old_data ->> 'phase', a.new_data ->> 'phase'
    from public.audit_log a
   where a.table_name = 'sale_days' and a.action = 'UPDATE'
     and (a.old_data ->> 'phase') is distinct from (a.new_data ->> 'phase')
)
select c.id, c.at, c.item_id, i.name as item_name, c.sale_day_id, c.field,
       c.old_value, c.new_value, c.actor as actor_id, p.display_name as actor_name
  from changes c
  left join public.items i on i.id = c.item_id
  left join public.profiles p on p.id = c.actor;

-- Treasurer email deposits now come from the cash counts. Replaced by the
-- coordinator's send in #72.
create or replace function public.weekly_treasurer_report(p_week_start date default public.treasurer_report_week())
returns jsonb
language sql stable security definer set search_path = '' as $$
  with dep as (
    select c.sale_date, c.deposit_cents, c.revenue_cents,
           coalesce(c.closed_by_name, '') as volunteers
      from public.sale_day_cash c
     where c.phase = 'closed'
       and c.sale_date between p_week_start and p_week_start + 6
  ), owed as (
    select c.buyer_id, c.buyer_name, pr.full_name as buyer_full_name,
           sum(c.net_cents)::int as total_cents,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'label', c.claim_label, 'purchased_on', c.purchased_on,
             'store', c.store, 'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
             'receipt_path', c.receipt_path) order by c.claim_no) as claims
      from public.claims c
      join public.profiles pr on pr.id = c.buyer_id
     where c.status = 'to_pay' and c.net_cents > 0
     group by c.buyer_id, c.buyer_name, pr.full_name
  )
  select jsonb_build_object(
    'week_start', p_week_start,
    'deposits', coalesce((select jsonb_agg(to_jsonb(dep) order by dep.sale_date) from dep), '[]'),
    'deposited_cents', coalesce((select sum(deposit_cents) from dep), 0)::int,
    'to_reimburse', coalesce((select jsonb_agg(to_jsonb(owed) order by owed.buyer_name) from owed), '[]'),
    'to_reimburse_cents', coalesce((select sum(total_cents) from owed), 0)::int,
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.claim_label, 'purchased_on', c.purchased_on, 'store', c.store,
        'buyer_name', c.buyer_name, 'buyer_full_name', pr.full_name,
        'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
        'status', case when c.status = 'to_pay' and c.net_cents = 0 then 'refunded' else c.status::text end,
        'paid_at', c.paid_at, 'payment_ref', c.payment_ref) order by c.claim_no)
      from public.claims c
      join public.profiles pr on pr.id = c.buyer_id), '[]')
  )
$$;

-- Refunds no longer wait for a sale to close: sale days don't touch stock.
create or replace function public.refund_purchase_line(
  p_id uuid,
  p_line uuid,
  p_pieces int,
  p_amount_cents int,
  p_refunded_on date,
  p_slip_path text default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_line public.purchase_lines;
  v_claim public.purchases;
  v_buyer text;
  v_pieces_left int;
  v_cents_left int;
  v_on_hand int;
begin
  perform public.require_member();
  if exists (select 1 from public.purchase_refunds where id = p_id) then return p_id; end if;

  select * into v_line from public.purchase_lines where id = p_line for update;
  if v_line.id is null then raise exception 'That line is not on a claim.'; end if;
  -- Locked so a Mark paid link cannot be redeemed between our checks and the insert.
  select * into v_claim from public.purchases where id = v_line.purchase_id for update;
  select display_name into v_buyer from public.profiles where id = v_claim.buyer_id;

  if v_claim.status = 'paid' then raise exception 'Already paid. Ask the treasurer.'; end if;
  if v_claim.buyer_id <> auth.uid() and not public.has_role('admin') then
    raise exception 'Only % or a coordinator can refund.', v_buyer;
  end if;

  if p_pieces is null or p_pieces < 1 then raise exception 'Enter the pieces.'; end if;
  select v_line.pieces - coalesce(sum(r.pieces), 0), v_line.cost_cents - coalesce(sum(r.amount_cents), 0)
    into v_pieces_left, v_cents_left
    from public.purchase_refunds r where r.purchase_line_id = v_line.id;
  if p_pieces > v_pieces_left then raise exception 'Only % left on this line.', v_pieces_left; end if;

  select on_hand into v_on_hand from public.item_stock where id = v_line.item_id;
  if p_pieces > greatest(v_on_hand, 0) then raise exception 'Only % on hand.', greatest(v_on_hand, 0); end if;


  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter the refund amount.'; end if;
  if p_amount_cents > v_cents_left then
    raise exception 'Up to % left on this line.', public.cents_text(v_cents_left);
  end if;

  insert into public.purchase_refunds (id, purchase_line_id, pieces, amount_cents, refunded_on, slip_path, note)
  values (p_id, p_line, p_pieces, p_amount_cents, p_refunded_on,
          nullif(p_slip_path, ''), nullif(trim(coalesce(p_note, '')), ''));
  insert into public.stock_movements (item_id, qty, reason, purchase_line_id, refund_id)
  values (v_line.item_id, -p_pieces, 'returned', p_line, p_id);
  return p_id;
end $$;

-- What to buy and shopping trips are gone (ADR-0016, #71). The team plans
-- trips in its group chat.
drop table public.shopping_trips;
