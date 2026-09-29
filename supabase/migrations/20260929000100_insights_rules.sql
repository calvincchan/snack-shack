-- "What the numbers say" (HANDOFF §5.8, ADR-0008). One view per rule; each
-- returns the facts and only has rows when the rule applies. The page turns
-- the facts into sentences and shows nothing for a rule with no rows.
-- Closed sale days only, term to date.

-- 1. Fading item: sales on its last day out are well below its first day out
--    (15% or more), across at least two days out.
create view public.insights_fading_items with (security_invoker = true) as
with days as (
  select r.item_id, sd.sale_date, greatest(r.sold_pieces, 0) as sold_pieces,
         row_number() over (partition by r.item_id order by sd.sale_date) as rn_first,
         row_number() over (partition by r.item_id order by sd.sale_date desc) as rn_last
    from public.sale_day_item_results r
    join public.sale_days sd on sd.id = r.sale_day_id and sd.phase = 'closed'
)
select i.id as item_id, i.name,
       f.sale_date as first_date, f.sold_pieces as first_pieces,
       l.sale_date as last_date, l.sold_pieces as last_pieces
  from public.items i
  join days f on f.item_id = i.id and f.rn_first = 1
  join days l on l.item_id = i.id and l.rn_last = 1
 where f.sale_date <> l.sale_date
   and f.sold_pieces > 0
   and l.sold_pieces * 100 <= f.sold_pieces * 85;

-- 2. Sold out: an item closed at 0 on some of the days it was out.
create view public.insights_sold_out_items with (security_invoker = true) as
select i.id as item_id, i.name,
       (count(*) filter (where r.left_count = 0))::int as sold_out_days,
       count(*)::int as days_out
  from public.sale_day_item_results r
  join public.sale_days sd on sd.id = r.sale_day_id and sd.phase = 'closed'
  join public.items i on i.id = r.item_id
 group by i.id, i.name
having count(*) filter (where r.left_count = 0) > 0;

-- 3. Slowest mover: lowest pieces per day out. Needs at least two items to
--    compare; ties go to the first name alphabetically.
create view public.insights_slowest_item with (security_invoker = true) as
select item_id, name, pieces_per_day_out, days_out
  from public.insights_items
 where (select count(*) from public.insights_items) >= 2
 order by pieces_per_day_out, name
 limit 1;

-- 4. Treat share: treats as a share of the items sold.
create view public.insights_treat_share with (security_invoker = true) as
select sum(t.treat_pieces_sold)::int as treat_pieces,
       sum(t.pieces_sold)::int as pieces_sold,
       round(100.0 * sum(t.treat_pieces_sold) / sum(t.pieces_sold))::int as treat_pct
  from public.sale_day_totals t
 where t.phase = 'closed'
having sum(t.pieces_sold) > 0;

-- 5. Losses at Check stock: pieces found missing or damaged before the sales,
--    and what they cost (current cost per piece). Only start_sale() writes
--    missing or damaged movements against a sale day, so this is Check stock.
create view public.insights_check_stock_losses with (security_invoker = true) as
select sum(-m.qty)::int as pieces,
       count(distinct m.item_id)::int as items,
       round(sum(-m.qty * i.unit_cost_cents))::int as cost_cents
  from public.stock_movements m
  join public.sale_days sd on sd.id = m.sale_day_id and sd.phase = 'closed'
  join public.items i on i.id = m.item_id
 where m.reason in ('missing', 'damaged')
having sum(-m.qty) > 0;
