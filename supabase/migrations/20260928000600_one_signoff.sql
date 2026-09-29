-- One volunteer confirms the count up, not two (ADR-0003 amended). Volunteers
-- run this after lunch with little time; the audit trail still records who.
create or replace function public.close_sale_day(p_sale_day uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record;
begin
  perform public.require_member();
  select * into t from public.sale_day_totals where sale_day_id = p_sale_day;
  if t.phase is distinct from 'counting' then raise exception 'This sale day is not being counted.'; end if;
  if t.signoffs < 1 then raise exception 'A volunteer needs to confirm the count.'; end if;
  if t.items_over_start > 0 then raise exception 'Some items show more left than you started with. Recount them.'; end if;
  if t.items_uncounted > 0 then raise exception 'Some items have no leftover count.'; end if;

  perform set_config('snack.fn', 'on', true);
  update public.sale_days set phase = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_sale_day and phase = 'counting';
  if not found then raise exception 'This sale day was already finished.'; end if;

  insert into public.stock_movements (item_id, qty, reason, sale_day_id)
  select item_id, -sold_pieces, 'sold', p_sale_day
  from public.sale_day_item_results where sale_day_id = p_sale_day and sold_pieces > 0;
  insert into public.stock_movements (item_id, qty, reason, sale_day_id)
  select item_id, -out_count, 'out', p_sale_day
  from public.sale_day_items where sale_day_id = p_sale_day and out_count > 0;
  perform set_config('snack.fn', '', true);
end $$;
