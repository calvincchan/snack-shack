-- What Deal check compares a box against (HANDOFF §5.4): what a piece of this
-- type usually costs us, and how fast one item of this type sells on a day it
-- is in the lineup.
--
-- "Usually" means the items that have been out and sold, so a box bought this
-- morning does not set the benchmark for itself. Early in a term nothing has
-- been out yet, so the average falls back to every priced, active item of that
-- type rather than showing nothing.

create view public.type_benchmarks with (security_invoker = true) as
select t.type,
       coalesce(
         (select avg(i.unit_cost_cents)
            from public.item_overview i
           where i.type = t.type and not i.archived and not i.is_new
             and i.price_cents is not null and i.unit_cost_cents > 0),
         (select avg(i.unit_cost_cents)
            from public.item_overview i
           where i.type = t.type and not i.archived
             and i.price_cents is not null and i.unit_cost_cents > 0)
       ) as usual_cost_cents,
       (select avg(s.pieces_per_day_out)
          from public.item_sale_stats s
          join public.items i on i.id = s.item_id
         where i.type = t.type and s.pieces_per_day_out is not null) as pieces_per_day_out
from (values ('snack'::public.item_type), ('treat'::public.item_type)) as t (type);
