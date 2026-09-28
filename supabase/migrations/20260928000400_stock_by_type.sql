-- What to buy is guidance, not a shopping list (ADR-0006): how much of each
-- type is on hand, how fast it goes, and roughly how much to top up.
--
-- `sold_per_sale_day` averages over finished sale days, so it is null until
-- the first one is closed and the screen says so instead of guessing.

create view public.stock_by_type with (security_invoker = true) as
with days as (
  select count(*)::int as n from public.sale_days where phase = 'closed'
), sold as (
  select r.locked_type as type, sum(greatest(r.sold_pieces, 0))::int as pieces
  from public.sale_day_item_results r
  join public.sale_days d on d.id = r.sale_day_id
  where d.phase = 'closed'
  group by r.locked_type
), held as (
  select i.type, coalesce(sum(i.on_hand), 0)::int as on_hand
  from public.item_stock i
  where not i.archived
  group by i.type
), rate as (
  select t.type,
         coalesce(h.on_hand, 0) as on_hand,
         case when days.n > 0 then coalesce(s.pieces, 0)::numeric / days.n end as sold_per_sale_day
  from (values ('snack'::public.item_type), ('treat'::public.item_type)) as t (type)
  cross join days
  left join sold s on s.type = t.type
  left join held h on h.type = t.type
)
select rate.type,
       rate.on_hand,
       rate.sold_per_sale_day,
       -- Target stock is about `target_sale_days` worth (HANDOFF §5, settings).
       ceil(rate.sold_per_sale_day * settings.target_sale_days)::int as target_pieces,
       greatest(ceil(rate.sold_per_sale_day * settings.target_sale_days)::int - rate.on_hand, 0)
         as buy_pieces,
       case when rate.sold_per_sale_day > 0
            then rate.on_hand / rate.sold_per_sale_day end as sale_days_left
from rate
cross join public.settings;
