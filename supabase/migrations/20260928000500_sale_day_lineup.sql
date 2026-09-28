-- What the Sale day screen reads while picking the lineup, checking stock and
-- selling (HANDOFF §4.1). The maths stays here (ADR-0008): the screen renders
-- what these views say and calls the sale day functions to move the phase on.

-- Every item that may go in a lineup, with the reason tag behind the
-- suggestion. suggest_lineup() already limits this to priced, active items
-- with stock > 0, which is exactly what a volunteer is allowed to pick.
create view public.lineup_options with (security_invoker = true) as
select s.item_id,
       i.name,
       i.type,
       i.storage,
       i.price_cents,
       i.bundle_size,
       i.unit_cost_cents,
       i.on_hand,
       s.score,
       s.reason,
       s.suggested
from public.suggest_lineup() s
join public.item_stock i on i.id = s.item_id;

-- One row per lineup item. Price, deal size and type are today's: the locked
-- ones once the sale has started, the item's own ones before that (ADR-0002).
-- `expected_count` is what Check stock pre-fills the stepper with.
create view public.sale_day_lineup with (security_invoker = true) as
select sdi.sale_day_id,
       sdi.item_id,
       i.name,
       i.storage,
       coalesce(sdi.locked_type, i.type) as type,
       coalesce(sdi.locked_price_cents, i.price_cents) as price_cents,
       coalesce(sdi.locked_bundle_size, i.bundle_size) as bundle_size,
       i.unit_cost_cents,
       i.on_hand as expected_count,
       sdi.check_count,
       sdi.check_reason,
       sdi.start_count,
       -- Pieces a day out, for the lineup margin. 15 when the item has never
       -- been out, so a new item neither helps nor hurts the estimate.
       coalesce(st.pieces_per_day_out, 15) as rate
from public.sale_day_items sdi
join public.item_stock i on i.id = sdi.item_id
left join public.item_sale_stats st on st.item_id = sdi.item_id;

-- The bottom bar on the lineup and Check stock screens, plus the sale day's
-- own number and date for the header.
create view public.sale_day_lineup_totals with (security_invoker = true) as
with numbered as (
  select id, sale_date, phase, float_cents,
         row_number() over (order by sale_date, created_at)::int as day_no
  from public.sale_days
), lineup as (
  select sale_day_id,
         count(*) filter (where type = 'snack')::int as snacks,
         count(*) filter (where type = 'treat')::int as treats,
         count(*) filter (where check_count is not null
                            and check_count <> expected_count)::int as items_off,
         sum(rate * unit_cost_cents) as cost_weight,
         sum(rate * price_cents::numeric / bundle_size) as price_weight
  from public.sale_day_lineup
  group by sale_day_id
)
select n.id as sale_day_id,
       n.sale_date,
       n.phase,
       n.float_cents,
       n.day_no,
       coalesce(l.snacks, 0) as snacks,
       coalesce(l.treats, 0) as treats,
       coalesce(l.items_off, 0) as items_off,
       -- HANDOFF §5.6: each item weighted by how fast it goes.
       case when l.price_weight > 0 then 1 - l.cost_weight / l.price_weight end as margin
from numbered n
left join lineup l on l.sale_day_id = n.id;
