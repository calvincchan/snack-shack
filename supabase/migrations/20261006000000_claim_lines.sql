-- Every line of a claim, for the expanded receipt view in Buy > Claims.
-- Same access as `claims`: invoker rights, so row level security decides.
create view public.claim_lines with (security_invoker = true) as
select l.id,
       l.purchase_id,
       l.line_no,
       l.pieces,
       l.cost_cents,
       i.name as item_name
from public.purchase_lines l
join public.items i on i.id = l.item_id;
