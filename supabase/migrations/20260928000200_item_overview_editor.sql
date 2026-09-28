-- The item editor needs to name whoever changed an item last, so that a second
-- volunteer saving over them is told "Yuki changed this to $2 a minute ago".

create or replace view public.item_overview with (security_invoker = true) as
select s.*,
       coalesce(st.days_out, 0) as days_out,
       -- "New" means never in a finished lineup (HANDOFF §5.6).
       (coalesce(st.days_out, 0) = 0) as is_new,
       st.pieces_per_day_out,
       last_buy.buyer_name as last_bought_by,
       last_buy.purchased_on as last_bought_on,
       editor.display_name as updated_by_name
from public.item_stock s
left join public.item_sale_stats st on st.item_id = s.id
left join lateral (
  select pr.display_name as buyer_name, p.purchased_on
  from public.purchase_lines l
  join public.purchases p on p.id = l.purchase_id
  join public.profiles pr on pr.id = p.buyer_id
  where l.item_id = s.id
  order by p.purchased_on desc, p.claim_no desc
  limit 1
) last_buy on true
left join public.profiles editor on editor.id = s.updated_by;
