-- Insights: term to date, closed sale days only (HANDOFF §4.5, ADR-0008).
-- The page reads these views and does no arithmetic of its own.
--
-- Cost of goods is the pieces sold times the item's current cost per piece
-- (the weighted average, ADR-0008). Stock movements do not carry a cost, so
-- an item bought at a new price nudges the profit of earlier sale days.

create view public.insights_sale_days with (security_invoker = true) as
select sd.id as sale_day_id,
       sd.sale_date,
       t.sales_cents,
       t.pieces_sold,
       t.counted_cents,
       t.over_short_cents,
       sd.helper_credits,
       sd.note,
       coalesce(c.cost_cents, 0)::int as cost_cents,
       (t.sales_cents - coalesce(c.cost_cents, 0) - sd.helper_credits * 100)::int as profit_cents,
       (select count(*) from public.sale_day_items sdi where sdi.sale_day_id = sd.id)::int as items_out,
       (select string_agg(p.display_name, ', ' order by s.signed_at)
          from public.sale_day_signoffs s
          join public.profiles p on p.id = s.user_id
         where s.sale_day_id = sd.id) as volunteers,
       abs(t.over_short_cents) > (select over_short_ok_cents from public.settings) as outside_ok
  from public.sale_days sd
  join public.sale_day_totals t on t.sale_day_id = sd.id
  left join lateral (
    select round(sum(r.sold_pieces * i.unit_cost_cents)) as cost_cents
      from public.sale_day_item_results r
      join public.items i on i.id = r.item_id
     where r.sale_day_id = sd.id and r.sold_pieces > 0
  ) c on true
 where sd.phase = 'closed';

create view public.insights_term with (security_invoker = true) as
select count(*)::int as sale_days,
       coalesce(sum(sales_cents), 0)::int as sales_cents,
       coalesce(sum(cost_cents), 0)::int as cost_cents,
       coalesce(sum(helper_credits), 0)::int * 100 as helper_credit_cents,
       coalesce(sum(profit_cents), 0)::int as profit_cents,
       coalesce(sum(pieces_sold), 0)::int as pieces_sold,
       coalesce(sum(over_short_cents), 0)::int as over_short_cents,
       (count(*) filter (where outside_ok))::int as sales_outside_ok,
       (select over_short_ok_cents from public.settings) as over_short_ok_cents,
       case when count(*) > 0 then round(sum(sales_cents)::numeric / count(*))::int end as sales_per_day_cents,
       case when count(*) > 0 then round(sum(pieces_sold)::numeric / count(*))::int end as pieces_per_day,
       case when sum(sales_cents) > 0 then round(100.0 * sum(profit_cents) / sum(sales_cents))::int end as margin_pct
  from public.insights_sale_days;

-- One row per item that has been in a closed lineup. Only the days the item was
-- in the lineup count, so items offered less often compare fairly.
create view public.insights_items with (security_invoker = true) as
select i.id as item_id,
       i.name,
       i.type,
       count(*)::int as days_out,
       sum(greatest(r.sold_pieces, 0))::int as pieces_sold,
       round(sum(greatest(r.sold_pieces, 0))::numeric / count(*))::int as pieces_per_day_out,
       sum(greatest(r.sales_cents, 0))::int as sales_cents
  from public.sale_day_item_results r
  join public.sale_days sd on sd.id = r.sale_day_id and sd.phase = 'closed'
  join public.items i on i.id = r.item_id
 group by i.id, i.name, i.type;
