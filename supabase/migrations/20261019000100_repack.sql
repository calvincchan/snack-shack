-- Repacking (ADR-0019, #85). Volunteers make a new item out of pieces of other
-- items, such as 5 Peach Slices and 1 Sour Keys Gummy into one candy pack.
-- repack() moves the stock and the cost over in one transaction. Items get no
-- flag: a pack item is one a repack made, and an item with no price that has
-- gone into a repack is Repack only.

-------------------------------------------------------------------------------
-- 1. A repack, and its movements in the ledger
-------------------------------------------------------------------------------
create table public.repacks (
  id           uuid primary key default gen_random_uuid(),  -- client supplies it (idempotent retries)
  pack_item_id uuid not null references public.items (id),
  packs        int not null check (packs >= 1),
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid default public.actor()
);
create index on public.repacks (pack_item_id);

create trigger audit after insert or update or delete on public.repacks
  for each row execute function public.audit_row('id');

alter table public.repacks enable row level security;
create policy read_all on public.repacks for select to authenticated using (public.is_member());
-- No write policies: repack() is the only way in.

alter table public.stock_movements
  add column repack_id uuid references public.repacks (id);
create index on public.stock_movements (repack_id) where repack_id is not null;

-- `repacked` is − for a source item and + for the pack item, never 0, and
-- always belongs to a repack. Clients cannot post it (member_insert allows
-- only donated and correction).
alter table public.stock_movements drop constraint stock_movements_qty_check;
alter table public.stock_movements add constraint stock_movements_qty_check
  check (qty <> 0 or reason = 'count');

alter table public.stock_movements drop constraint stock_movements_sign;
alter table public.stock_movements add constraint stock_movements_sign check (
  (reason in ('purchase', 'found') and qty > 0)
  or (reason in ('sold', 'out', 'missing', 'damaged', 'donated', 'returned') and qty < 0)
  or reason in ('correction', 'count', 'repacked')
);

alter table public.stock_movements add constraint stock_movements_repack check (
  (reason = 'repacked') = (repack_id is not null)
);

-- The sign of a repacked movement depends on its side, which a check
-- constraint cannot see: + for the repack's pack item, − for every source.
create function public.check_repack_side()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.qty > 0) <> (new.item_id = (select pack_item_id from public.repacks where id = new.repack_id)) then
    raise exception 'A repack adds to the item made and takes from the items that went in.';
  end if;
  return new;
end $$;

create trigger stock_movements_repack_side before insert on public.stock_movements
  for each row when (new.reason = 'repacked') execute function public.check_repack_side();

-------------------------------------------------------------------------------
-- 2. Items tab: repacked pieces since the last count, pack items, repack sources
-------------------------------------------------------------------------------
create or replace view public.item_counts with (security_invoker = true) as
with last_count as (
  select distinct on (item_id) item_id, seq, qty, created_at
  from public.stock_movements
  where reason = 'count'
  order by item_id, seq desc
)
select i.id as item_id,
       lc.created_at as last_counted_at,
       case when lc.seq is not null then
         (select coalesce(sum(m.qty), 0) from public.stock_movements m
           where m.item_id = i.id and m.seq <= lc.seq)::int
       end as last_counted_pieces,
       -- Purchases minus returns since the last count (all of them if never counted).
       (select coalesce(sum(m.qty), 0) from public.stock_movements m
         where m.item_id = i.id
           and m.reason in ('purchase', 'returned')
           and (lc.seq is null or m.seq > lc.seq))::int as bought_since,
       -- Gone since the count on an earlier day: minus every count row of the
       -- latest count day, so saving twice in a day doesn't shrink it. Null until
       -- an item has been counted on two different days (Vancouver time).
       case when exists (select 1 from public.stock_movements c
                          where c.item_id = i.id and c.reason = 'count'
                            and (c.created_at at time zone 'America/Vancouver')::date
                                < (lc.created_at at time zone 'America/Vancouver')::date)
            then -(select sum(c.qty) from public.stock_movements c
                    where c.item_id = i.id and c.reason = 'count'
                      and (c.created_at at time zone 'America/Vancouver')::date
                          = (lc.created_at at time zone 'America/Vancouver')::date)::int
       end as pieces_gone,
       -- Net repacked pieces since the last count: + made, − used.
       (select coalesce(sum(m.qty), 0) from public.stock_movements m
         where m.item_id = i.id
           and m.reason = 'repacked'
           and (lc.seq is null or m.seq > lc.seq))::int as repacked_since
from public.items i
left join last_count lc on lc.item_id = i.id;

create or replace view public.item_overview with (security_invoker = true) as
select s.*,
       (s.created_at > now() - interval '30 days') as is_new,
       last_buy.buyer_name as last_bought_by,
       last_buy.purchased_on as last_bought_on,
       editor.display_name as updated_by_name,
       c.last_counted_at,
       c.last_counted_pieces,
       c.bought_since,
       c.pieces_gone,
       c.repacked_since,
       -- A pack item is one a repack made; never stored, so it cannot drift.
       exists (select 1 from public.repacks r where r.pack_item_id = s.id) as made_by_repack,
       -- Has gone into a repack. With no price, the item is Repack only.
       exists (select 1 from public.stock_movements m
                where m.item_id = s.id and m.reason = 'repacked' and m.qty < 0) as in_repacks
from public.item_stock s
left join lateral (
  select pr.display_name as buyer_name, p.purchased_on
  from public.purchase_lines l
  join public.purchases p on p.id = l.purchase_id
  join public.profiles pr on pr.id = p.buyer_id
  where l.item_id = s.id
  order by p.purchased_on desc, p.claim_no desc
  limit 1
) last_buy on true
left join public.profiles editor on editor.id = s.updated_by
left join public.item_counts c on c.item_id = s.id;

-------------------------------------------------------------------------------
-- 3. Insights: priced items only; pack items restock and skip Deal check
-------------------------------------------------------------------------------
create or replace view public.insights_items with (security_invoker = true) as
select i.id as item_id,
       i.name,
       i.price_cents,
       i.bundle_size,
       i.unit_cost_cents,
       c.last_counted_at,
       c.pieces_gone,
       case when i.price_cents is not null
            then round(c.pieces_gone * i.price_cents::numeric / i.bundle_size)::int
       end as revenue_estimate_cents,
       case when i.price_cents is not null
            then 1 - (i.unit_cost_cents * i.bundle_size) / i.price_cents
       end as margin,
       exists (select 1 from public.repacks r where r.pack_item_id = i.id) as made_by_repack
  from public.items i
  join public.item_counts c on c.item_id = i.id
 where c.pieces_gone is not null and not i.archived and i.price_cents is not null;

-- insights_slowest_item reads insights_items, so it follows.

-- Low margin stock: packs made since the count restock a pack item the way
-- purchases restock a bought one.
create or replace view public.insights_low_margin_items with (security_invoker = true) as
select i.id as item_id, i.name, c.bought_since,
       1 - (i.unit_cost_cents * i.bundle_size) / i.price_cents as margin
  from public.items i
  join public.item_counts c on c.item_id = i.id
 where not i.archived
   and i.price_cents is not null
   and (c.bought_since > 0 or c.repacked_since > 0)
   and 1 - (i.unit_cost_cents * i.bundle_size) / i.price_cents < 0.3;

-- Deal check compares a store box with what we usually pay a piece. A pack
-- item's piece is a whole pack, never bought in a store, so it stays out.
create or replace view public.type_benchmarks with (security_invoker = true) as
select t.type,
       coalesce(
         (select avg(i.unit_cost_cents) from public.item_overview i
           where i.type = t.type and not i.archived and not i.is_new and not i.made_by_repack
             and i.price_cents is not null and i.unit_cost_cents > 0),
         (select avg(i.unit_cost_cents) from public.item_overview i
           where i.type = t.type and not i.archived and not i.made_by_repack
             and i.price_cents is not null and i.unit_cost_cents > 0)
       ) as usual_cost_cents
from (values ('snack'::public.item_type), ('treat'::public.item_type)) t(type);

-------------------------------------------------------------------------------
-- 4. Record a repack
-------------------------------------------------------------------------------
-- p: {
--   "id": "...",                         client-generated; a retry returns it again
--   "pack_item_id": "..."                the item made, or
--   "new_item": {"name", "type", "storage", "price_cents", "bundle_size"},
--   "packs": 31,
--   "sources": [{"item_id": "...", "pieces_per_pack": 5}, ...],
--   "note": "..."                        optional
-- }
-- Posts one − movement per source item and one + movement for the pack item,
-- and blends the pieces' cost into the pack item's weighted average the same
-- way log_purchase does. There is no on-hand check (ADR-0019). Returns the id.
create function public.repack(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_pack uuid := (p ->> 'pack_item_id')::uuid;
  v_packs int := (p ->> 'packs')::int;
  v_src jsonb;
  v_item uuid;
  v_per int;
  v_seen uuid[] := '{}';
  v_cents numeric := 0;
  v_cost numeric;
  v_on_hand int;
  v_archived boolean;
begin
  perform public.require_member();
  if v_id is null then raise exception 'A repack needs an id.'; end if;
  if exists (select 1 from public.repacks where id = v_id) then return v_id; end if;

  if v_packs is null or v_packs < 1 then raise exception 'Make at least one pack.'; end if;
  if p -> 'sources' is null or jsonb_typeof(p -> 'sources') <> 'array'
     or jsonb_array_length(p -> 'sources') = 0 then
    raise exception 'Add at least one item that went in.';
  end if;

  if v_pack is null then
    if p -> 'new_item' is null then raise exception 'Pick the item you made.'; end if;
    if coalesce(trim(p -> 'new_item' ->> 'name'), '') = '' then
      raise exception 'Give the new item a name.';
    end if;
    insert into public.items (name, type, storage, price_cents, bundle_size)
    values (trim(p -> 'new_item' ->> 'name'),
            (p -> 'new_item' ->> 'type')::public.item_type,
            coalesce((p -> 'new_item' ->> 'storage')::public.storage_kind, 'shelf'),
            (p -> 'new_item' ->> 'price_cents')::int,
            coalesce((p -> 'new_item' ->> 'bundle_size')::int, 1))
    returning id into v_pack;
  else
    select archived into v_archived from public.items where id = v_pack;
    if not found then raise exception 'That item no longer exists.'; end if;
    if v_archived then raise exception 'That item is archived.'; end if;
  end if;

  insert into public.repacks (id, pack_item_id, packs, note)
  values (v_id, v_pack, v_packs, nullif(trim(p ->> 'note'), ''));

  for v_src in select * from jsonb_array_elements(p -> 'sources') loop
    v_item := (v_src ->> 'item_id')::uuid;
    v_per := (v_src ->> 'pieces_per_pack')::int;
    if v_per is null or v_per < 1 then raise exception 'Pieces per pack must be 1 or more.'; end if;
    if v_item = v_pack then raise exception 'An item cannot go into itself.'; end if;
    if v_item = any (v_seen) then raise exception 'Each item can be added once.'; end if;
    v_seen := v_seen || v_item;

    select unit_cost_cents, archived into v_cost, v_archived
    from public.items where id = v_item;
    if not found then raise exception 'That item no longer exists.'; end if;
    if v_archived then raise exception 'That item is archived.'; end if;

    v_cents := v_cents + v_packs * v_per * v_cost;
    insert into public.stock_movements (item_id, qty, reason, repack_id)
    values (v_item, -(v_packs * v_per), 'repacked', v_id);
  end loop;

  select on_hand, unit_cost_cents into v_on_hand, v_cost from public.item_stock where id = v_pack;
  v_on_hand := greatest(v_on_hand, 0);
  update public.items
     set unit_cost_cents = round(((v_on_hand * v_cost) + v_cents) / (v_on_hand + v_packs), 2)
   where id = v_pack;

  insert into public.stock_movements (item_id, qty, reason, repack_id)
  values (v_pack, v_packs, 'repacked', v_id);

  return v_id;
end $$;

revoke execute on function public.repack(jsonb) from public, anon;
grant execute on function public.repack(jsonb) to authenticated;
