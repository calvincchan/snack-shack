-- Occasional stock counts (ADR-0016, HANDOFF §4.4 and §5.5, #74).
-- Sale days no longer post stock, so Items shows what the app knows: the last
-- count and what was bought since. Saving a count posts the difference from the
-- ledger, so the ledger still sums to what was on the shelf.

-------------------------------------------------------------------------------
-- 1. Ledger order, and count movements (± and may be 0: "counted, nothing gone")
-------------------------------------------------------------------------------
-- created_at is the same for every row written in one transaction, so a
-- sequence gives the ledger a strict order ("since the last count").
alter table public.stock_movements add column seq bigint generated always as identity;
create unique index stock_movements_seq on public.stock_movements (seq);

alter table public.stock_movements drop constraint stock_movements_qty_check;
alter table public.stock_movements add constraint stock_movements_qty_check
  check (qty <> 0 or reason = 'count');

alter table public.stock_movements drop constraint stock_movements_sign;
alter table public.stock_movements add constraint stock_movements_sign check (
  (reason in ('purchase', 'found') and qty > 0)
  or (reason in ('sold', 'out', 'missing', 'damaged', 'donated', 'returned') and qty < 0)
  or reason in ('correction', 'count')
);

-------------------------------------------------------------------------------
-- 2. Per-item count summary
-------------------------------------------------------------------------------
create view public.item_counts with (security_invoker = true) as
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
       -- Between the last two counts; null until an item has been counted twice.
       case when (select count(*) from public.stock_movements c
                   where c.item_id = i.id and c.reason = 'count') >= 2
            then -lc.qty end as pieces_gone
from public.items i
left join last_count lc on lc.item_id = i.id;

-------------------------------------------------------------------------------
-- 3. Items tab reads the counts too
-------------------------------------------------------------------------------
create or replace view public.item_overview with (security_invoker = true) as
select s.*,
       (s.created_at > now() - interval '30 days') as is_new,
       last_buy.buyer_name as last_bought_by,
       last_buy.purchased_on as last_bought_on,
       editor.display_name as updated_by_name,
       c.last_counted_at,
       c.last_counted_pieces,
       c.bought_since,
       c.pieces_gone
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
-- 4. Save a stock count
-------------------------------------------------------------------------------
-- p_counts: [{"item_id": "...", "pieces": 24}, ...]. Items left out post nothing.
-- Returns how many items were counted.
create function public.save_stock_count(p_counts jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_item uuid;
  v_pieces int;
  v_on_hand int;
  v_seen uuid[] := '{}';
begin
  perform public.require_member();
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'Count at least one item.';
  end if;

  for v_row in select * from jsonb_array_elements(p_counts) loop
    v_item := (v_row ->> 'item_id')::uuid;
    v_pieces := (v_row ->> 'pieces')::int;
    if v_pieces is null or v_pieces < 0 then raise exception 'Pieces must be 0 or more.'; end if;
    if v_item = any (v_seen) then raise exception 'Each item can be counted once per save.'; end if;
    v_seen := v_seen || v_item;

    select on_hand into v_on_hand from public.item_stock where id = v_item;
    if not found then raise exception 'That item no longer exists.'; end if;

    insert into public.stock_movements (item_id, qty, reason)
    values (v_item, v_pieces - v_on_hand, 'count');
  end loop;

  return array_length(v_seen, 1);
end $$;

revoke execute on function public.save_stock_count(jsonb) from public, anon;
grant execute on function public.save_stock_count(jsonb) to authenticated;
