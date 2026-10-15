-- Insights after ADR-0015 and ADR-0016 (HANDOFF §4.5, §5.7, §5.8, #75).
-- Revenue comes from the cash counts, spending from claims (net of refunds),
-- and a rough per-item picture from stock counts. Term to date. The page reads
-- these views and does no arithmetic of its own; each rule is one view that
-- has rows only when the rule applies.

-- Term totals: every closed sale day, every claim.
create view public.insights_term with (security_invoker = true) as
select (select count(*) from public.sale_day_cash where phase = 'closed')::int as sale_days,
       coalesce((select sum(revenue_cents) from public.sale_day_cash where phase = 'closed'), 0)::int as revenue_cents,
       coalesce((select sum(net_cents) from public.claims), 0)::int as claims_cents,
       (coalesce((select sum(revenue_cents) from public.sale_day_cash where phase = 'closed'), 0)
        - coalesce((select sum(net_cents) from public.claims), 0))::int as difference_cents,
       (select round(avg(revenue_cents))::int from public.sale_day_cash where phase = 'closed') as revenue_per_day_cents;

-- By month: revenue by sale date, claims by purchase date (Vancouver dates).
create view public.insights_months with (security_invoker = true) as
with rev as (
  select date_trunc('month', sale_date)::date as month, sum(revenue_cents)::int as revenue_cents
    from public.sale_day_cash where phase = 'closed' group by 1
), spent as (
  select date_trunc('month', purchased_on)::date as month, sum(net_cents)::int as claims_cents
    from public.claims group by 1
)
select coalesce(r.month, s.month) as month,
       coalesce(r.revenue_cents, 0) as revenue_cents,
       coalesce(s.claims_cents, 0) as claims_cents,
       (coalesce(r.revenue_cents, 0) - coalesce(s.claims_cents, 0)) as difference_cents
  from rev r
  full join spent s on s.month = r.month;

-- Items since the last stock count (§5.7). Only items counted on two different
-- days. Estimates use today's price and cost.
create view public.insights_items with (security_invoker = true) as
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
       end as margin
  from public.items i
  join public.item_counts c on c.item_id = i.id
 where c.pieces_gone is not null and not i.archived;

-- Rule 1. Best month: highest revenue minus claims. Needs two months to compare.
create view public.insights_best_month with (security_invoker = true) as
select month, revenue_cents, claims_cents, difference_cents
  from public.insights_months
 where (select count(*) from public.insights_months) >= 2
 order by difference_cents desc, month desc
 limit 1;

-- Rule 2. Revenue trend: the latest sale day against the average of the others.
create view public.insights_revenue_trend with (security_invoker = true) as
with days as (
  select sale_date, revenue_cents,
         row_number() over (order by sale_date desc) as rn
    from public.sale_day_cash where phase = 'closed'
), usual as (
  select round(avg(revenue_cents))::int as usual_cents from days where rn > 1
)
select d.sale_date, d.revenue_cents, u.usual_cents,
       (d.revenue_cents - u.usual_cents) as difference_cents
  from days d, usual u
 where d.rn = 1 and u.usual_cents is not null and d.revenue_cents <> u.usual_cents;

-- Rule 3. Open count off: sale days whose open count didn't match the last left in box.
create view public.insights_open_count_off with (security_invoker = true) as
select count(*)::int as sale_days
  from public.sale_day_cash
 where phase = 'closed' and open_diff_cents is not null and open_diff_cents <> 0
having count(*) > 0;

-- Rule 4. Slowest mover: fewest pieces gone. Needs two items to compare;
-- ties go to the first name alphabetically.
create view public.insights_slowest_item with (security_invoker = true) as
select item_id, name, pieces_gone
  from public.insights_items
 where (select count(*) from public.insights_items) >= 2
 order by pieces_gone, name
 limit 1;

-- Rule 5. Low margin stock: a Low margin or At a loss band (below 30%) with
-- stock bought since the last count.
create view public.insights_low_margin_items with (security_invoker = true) as
select i.id as item_id, i.name, c.bought_since,
       1 - (i.unit_cost_cents * i.bundle_size) / i.price_cents as margin
  from public.items i
  join public.item_counts c on c.item_id = i.id
 where not i.archived
   and i.price_cents is not null
   and c.bought_since > 0
   and 1 - (i.unit_cost_cents * i.bundle_size) / i.price_cents < 0.3;
