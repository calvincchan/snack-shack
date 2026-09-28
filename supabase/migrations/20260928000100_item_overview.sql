-- What the Items tab reads: one row per item with everything shown on it.
--
-- Margins and bands stay in the browser (the Deal check calculator needs the
-- same maths on numbers that are not in the database yet), but anything that
-- needs the ledger or the sale history is worked out here.

create view public.item_overview with (security_invoker = true) as
select s.*,
       coalesce(st.days_out, 0) as days_out,
       -- "New" means never in a finished lineup (HANDOFF §5.6).
       (coalesce(st.days_out, 0) = 0) as is_new,
       st.pieces_per_day_out,
       last_buy.buyer_name as last_bought_by,
       last_buy.purchased_on as last_bought_on
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
) last_buy on true;
