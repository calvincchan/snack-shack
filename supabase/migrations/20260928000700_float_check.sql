-- Check the change float before the sale (ADR-0003 amended). Start sale takes
-- the counted float; null keeps the value the sale day started with.
drop function public.start_sale(uuid);

create function public.start_sale(p_sale_day uuid, p_float_cents int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_diff int;
begin
  perform public.require_member();
  if p_float_cents < 0 then raise exception 'The change float cannot be negative.'; end if;
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set phase = 'selling', started_at = now(), started_by = auth.uid(),
         float_cents = coalesce(p_float_cents, float_cents)
   where id = p_sale_day and phase = 'lineup';
  if not found then raise exception 'This sale has already started.'; end if;
  if not exists (select 1 from public.sale_day_items where sale_day_id = p_sale_day) then
    raise exception 'Pick at least one item for the lineup.';
  end if;

  for r in
    select sdi.item_id, sdi.check_count, sdi.check_reason, i.on_hand, i.price_cents, i.bundle_size, i.type, i.name
    from public.sale_day_items sdi
    join public.item_stock i on i.id = sdi.item_id
    where sdi.sale_day_id = p_sale_day
  loop
    if r.price_cents is null then raise exception '% needs a price before it can be sold.', r.name; end if;
    v_diff := coalesce(r.check_count, r.on_hand) - r.on_hand;
    if v_diff < 0 then
      insert into public.stock_movements (item_id, qty, reason, sale_day_id)
      values (r.item_id, v_diff, coalesce(r.check_reason, 'missing')::text::public.movement_reason, p_sale_day);
    elsif v_diff > 0 then
      insert into public.stock_movements (item_id, qty, reason, sale_day_id)
      values (r.item_id, v_diff, 'found', p_sale_day);
    end if;
    update public.sale_day_items
       set start_count = r.on_hand + v_diff,
           locked_price_cents = r.price_cents,
           locked_bundle_size = r.bundle_size,
           locked_type = r.type
     where sale_day_id = p_sale_day and item_id = r.item_id;
  end loop;
  perform set_config('snack.fn', '', true);
end $$;
