-- Change history for the sale day and item sheets (HANDOFF §6).
--
-- One row per field that changed, read from audit_log. The app words the
-- sentence ("BBQ chips count changed 14 → 12 by Yuki at 12:58"); the database
-- decides which changes are worth showing.
create view public.change_history with (security_invoker = true) as
with changes as (
  -- Item edits: what a volunteer can change in the editor, plus archiving.
  select a.id, a.at, a.actor,
         (a.new_data ->> 'id')::uuid as item_id,
         null::uuid as sale_day_id,
         f.field,
         a.old_data ->> f.field as old_value,
         a.new_data ->> f.field as new_value
    from public.audit_log a
    cross join (values ('name'), ('type'), ('storage'), ('archived')) as f (field)
   where a.table_name = 'items'
     and a.action = 'UPDATE'
     and a.old_data ->> f.field is distinct from a.new_data ->> f.field
     -- log_purchase creates a new item and prices it in one transaction; that
     -- is the item being made, not an edit.
     and not exists (select 1 from public.audit_log b
                      where b.table_name = 'items' and b.action = 'INSERT'
                        and b.row_pk = a.row_pk and b.at = a.at)
  union all
  -- A price is a price and a bundle size, written "cents/bundle" ("100/2" is
  -- 2 for $1), so one edit is one row.
  select a.id, a.at, a.actor,
         (a.new_data ->> 'id')::uuid,
         null::uuid,
         'price',
         (a.old_data ->> 'price_cents') || '/' || (a.old_data ->> 'bundle_size'),
         (a.new_data ->> 'price_cents') || '/' || (a.new_data ->> 'bundle_size')
    from public.audit_log a
   where a.table_name = 'items'
     and a.action = 'UPDATE'
     and (a.old_data ->> 'price_cents', a.old_data ->> 'bundle_size')
         is distinct from (a.new_data ->> 'price_cents', a.new_data ->> 'bundle_size')
     and not exists (select 1 from public.audit_log b
                      where b.table_name = 'items' and b.action = 'INSERT'
                        and b.row_pk = a.row_pk and b.at = a.at)
  union all
  -- Counts: the check stock number and the count-up number on a sale day.
  select a.id, a.at, a.actor,
         (a.new_data ->> 'item_id')::uuid,
         (a.new_data ->> 'sale_day_id')::uuid,
         f.field,
         a.old_data ->> f.field,
         a.new_data ->> f.field
    from public.audit_log a
    cross join (values ('check_count'), ('left_count')) as f (field)
   where a.table_name = 'sale_day_items'
     and a.action in ('INSERT', 'UPDATE')
     and a.new_data ->> f.field is not null
     -- begin_count fills every left count from the start count; only a
     -- volunteer changing it after that is worth showing.
     and (f.field = 'check_count' or a.old_data ->> f.field is not null)
     and a.old_data ->> f.field is distinct from a.new_data ->> f.field
  union all
  -- Sale day phase: started, counting, closed.
  select a.id, a.at, a.actor,
         null::uuid,
         (a.new_data ->> 'id')::uuid,
         'phase',
         a.old_data ->> 'phase',
         a.new_data ->> 'phase'
    from public.audit_log a
   where a.table_name = 'sale_days'
     and a.action = 'UPDATE'
     and a.old_data ->> 'phase' is distinct from a.new_data ->> 'phase'
)
select c.id, c.at, c.item_id, i.name as item_name, c.sale_day_id, c.field,
       c.old_value, c.new_value, c.actor as actor_id,
       p.display_name as actor_name
  from changes c
  left join public.items i on i.id = c.item_id
  left join public.profiles p on p.id = c.actor;
