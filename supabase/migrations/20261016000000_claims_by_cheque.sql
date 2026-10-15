-- Claims go to the treasurer when the coordinator sends them, and are paid by
-- cheque (ADR-0017, HANDOFF §4.2 and §5.9, #72).
--
-- Removed: the weekly cron job, the one-time Mark paid links and the treasurer
-- role (the enum value stays; removing one is awkward, so profiles and invites
-- that held it become volunteers).
-- Added: coordinator-only mark paid and mark unpaid, a record of each send to
-- the treasurer, and the coordinator-only rule on who a purchase is logged for.

-------------------------------------------------------------------------------
-- 1. Remove the weekly email and its links
-------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-treasurer-email') then
    perform cron.unschedule('weekly-treasurer-email');
  end if;
end $$;

drop function public.invoke_weekly_treasurer_email();
drop function public.weekly_treasurer_report(date);
drop function public.treasurer_report_week(timestamptz);
drop function public.issue_mark_paid_tokens(interval);
drop function public.redeem_action_token(text, text);
drop table public.action_tokens;

update public.profiles set role = 'volunteer' where role = 'treasurer';
update public.volunteer_invites set role = 'volunteer' where role = 'treasurer';

-------------------------------------------------------------------------------
-- 2. payment_ref becomes the paid note ("Cheque #142")
-------------------------------------------------------------------------------
drop view public.claims;
alter table public.purchases rename column payment_ref to payment_note;

create view public.claims with (security_invoker = true) as
select p.*,
       'SS-' || lpad(p.claim_no::text, 3, '0') as claim_label,
       (select coalesce(sum(l.cost_cents), 0) from public.purchase_lines l where l.purchase_id = p.id)::int as total_cents,
       pr.display_name as buyer_name,
       pr.full_name as buyer_full_name,
       (select coalesce(sum(r.amount_cents), 0)
          from public.purchase_refunds r
          join public.purchase_lines l on l.id = r.purchase_line_id
         where l.purchase_id = p.id)::int as refunded_cents,
       ((select coalesce(sum(l.cost_cents), 0) from public.purchase_lines l where l.purchase_id = p.id)
        - (select coalesce(sum(r.amount_cents), 0)
             from public.purchase_refunds r
             join public.purchase_lines l on l.id = r.purchase_line_id
            where l.purchase_id = p.id))::int as net_cents
from public.purchases p
join public.profiles pr on pr.id = p.buyer_id;

-------------------------------------------------------------------------------
-- 3. Mark paid and mark unpaid (coordinator only)
-------------------------------------------------------------------------------
create function public.require_coordinator() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'Only the coordinator can do this.'; end if;
end $$;

-- Marks the listed claims paid, for one cheque or one claim. Refuses when any
-- claim is no longer To pay or the net total is not what the coordinator saw.
create function public.mark_claims_paid(
  p_purchase_ids uuid[],
  p_expected_cents int,
  p_paid_on date,
  p_note text default null
) returns int language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_locked int;
  v_net int;
begin
  perform public.require_coordinator();
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_purchase_ids) as x;
  if cardinality(v_ids) = 0 then raise exception 'Pick the claims to mark paid.'; end if;
  if p_paid_on is null then raise exception 'Enter the date paid.'; end if;
  if p_paid_on > (now() at time zone 'America/Vancouver')::date then
    raise exception 'The paid date cannot be in the future.';
  end if;

  -- Locked so a refund cannot change a claim between the checks and the update.
  select count(*) into v_locked
    from (select id from public.purchases
           where id = any (v_ids) and status = 'to_pay' for update) as locked;
  if v_locked <> cardinality(v_ids) then
    raise exception 'A claim changed since you loaded this list. Check it and try again.';
  end if;
  select coalesce(sum(net_cents), 0) into v_net from public.claims where id = any (v_ids);
  if v_net is distinct from p_expected_cents then
    raise exception 'A claim changed since you loaded this list. Check it and try again.';
  end if;

  update public.purchases
     set status = 'paid',
         paid_at = (p_paid_on + time '12:00') at time zone 'America/Vancouver',
         paid_by = auth.uid(),
         payment_note = nullif(btrim(p_note), '')
   where id = any (v_ids);
  return cardinality(v_ids);
end $$;

create function public.mark_claim_unpaid(p_purchase_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_coordinator();
  update public.purchases
     set status = 'to_pay', paid_at = null, paid_by = null, payment_note = null
   where id = p_purchase_id and status = 'paid';
  if not found then raise exception 'That claim is not paid.'; end if;
end $$;

-------------------------------------------------------------------------------
-- 4. Send claims to the treasurer
-------------------------------------------------------------------------------
create table public.claim_sends (
  id          uuid primary key default gen_random_uuid(),
  sent_at     timestamptz not null default now(),
  sent_by     uuid not null references public.profiles (id),
  sent_to     text not null,
  claim_count int not null,
  total_cents int not null
);
alter table public.claim_sends enable row level security;
create policy read_all on public.claim_sends for select to authenticated using (public.is_member());

create view public.last_claims_send with (security_invoker = true) as
select s.id, s.sent_at, s.sent_to, s.claim_count, s.total_cents,
       p.display_name as sent_by_name
  from public.claim_sends s
  join public.profiles p on p.id = s.sent_by
 order by s.sent_at desc
 limit 1;

-- What the email is built from: every To pay claim per volunteer, the deposits
-- from sale days closed since the last send, and the whole ledger for the CSV.
create function public.claims_report()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz;
  v_report jsonb;
begin
  perform public.require_coordinator();
  select max(sent_at) into v_since from public.claim_sends;

  with dep as (
    select c.sale_date, c.deposit_cents, c.revenue_cents,
           coalesce(c.closed_by_name, '') as volunteers
      from public.sale_day_cash c
     where c.phase = 'closed' and (v_since is null or c.closed_at > v_since)
  ), owed as (
    select c.buyer_id, c.buyer_name, c.buyer_full_name,
           sum(c.net_cents)::int as total_cents,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'label', c.claim_label, 'purchased_on', c.purchased_on,
             'store', c.store, 'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
             'receipt_path', c.receipt_path) order by c.claim_no) as claims
      from public.claims c
     where c.status = 'to_pay' and c.net_cents > 0
     group by c.buyer_id, c.buyer_name, c.buyer_full_name
  )
  select jsonb_build_object(
    'since', v_since,
    'deposits', coalesce((select jsonb_agg(to_jsonb(dep) order by dep.sale_date) from dep), '[]'),
    'deposited_cents', coalesce((select sum(deposit_cents) from dep), 0)::int,
    'to_reimburse', coalesce((select jsonb_agg(to_jsonb(owed) order by owed.buyer_name) from owed), '[]'),
    'to_reimburse_cents', coalesce((select sum(total_cents) from owed), 0)::int,
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.claim_label, 'purchased_on', c.purchased_on, 'store', c.store,
        'buyer_name', c.buyer_name, 'buyer_full_name', c.buyer_full_name,
        'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
        'status', case when c.status = 'to_pay' and c.net_cents = 0 then 'refunded' else c.status::text end,
        'paid_at', c.paid_at, 'payment_note', c.payment_note) order by c.claim_no)
      from public.claims c), '[]')
  ) into v_report;
  return v_report;
end $$;

-- Called by the send function with the coordinator's own session, after Resend
-- accepted the email.
create function public.record_claims_send(p_sent_to text, p_claim_count int, p_total_cents int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.require_coordinator();
  insert into public.claim_sends (sent_by, sent_to, claim_count, total_cents)
  values (auth.uid(), p_sent_to, p_claim_count, p_total_cents)
  returning id into v_id;
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- 5. Logging for someone else is the coordinator's job
-------------------------------------------------------------------------------
create or replace function public.log_purchase(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_line jsonb;
  v_n int := 0;
  v_item uuid;
  v_on_hand int;
  v_cost numeric;
  v_line_id uuid;
begin
  perform public.require_member();
  if exists (select 1 from public.purchases where id = v_id) then return v_id; end if;
  if (p ->> 'buyer_id')::uuid is distinct from auth.uid() and not public.has_role('admin') then
    raise exception 'Only the coordinator can log a purchase for someone else.';
  end if;
  if coalesce(p ->> 'receipt_path', '') = '' then raise exception 'Attach the receipt photo.'; end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]')) = 0 then raise exception 'Add at least one item.'; end if;

  insert into public.purchases (id, purchased_on, store, buyer_id, receipt_path)
  values (v_id, (p ->> 'purchased_on')::date, p ->> 'store', (p ->> 'buyer_id')::uuid, p ->> 'receipt_path');

  for v_line in select * from jsonb_array_elements(p -> 'lines') loop
    v_n := v_n + 1;
    v_item := (v_line ->> 'item_id')::uuid;
    if v_item is null then
      insert into public.items (name, type, storage)
      values (trim(v_line -> 'new_item' ->> 'name'),
              (v_line -> 'new_item' ->> 'type')::public.item_type,
              coalesce((v_line -> 'new_item' ->> 'storage')::public.storage_kind, 'shelf'))
      returning id into v_item;
    end if;

    select on_hand, unit_cost_cents into v_on_hand, v_cost from public.item_stock where id = v_item;
    v_on_hand := greatest(v_on_hand, 0);
    update public.items
       set unit_cost_cents = round(((v_on_hand * v_cost) + (v_line ->> 'cost_cents')::int)
                                   / (v_on_hand + (v_line ->> 'pieces')::int), 2),
           price_cents = coalesce((v_line ->> 'price_cents')::int, price_cents),
           bundle_size = case when v_line ->> 'price_cents' is not null
                              then coalesce((v_line ->> 'bundle_size')::int, 1) else bundle_size end
     where id = v_item;

    insert into public.purchase_lines (purchase_id, line_no, item_id, pieces, cost_cents)
    values (v_id, v_n, v_item, (v_line ->> 'pieces')::int, (v_line ->> 'cost_cents')::int)
    returning id into v_line_id;
    insert into public.stock_movements (item_id, qty, reason, purchase_line_id)
    values (v_item, (v_line ->> 'pieces')::int, 'purchase', v_line_id);
  end loop;
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- 6. Who can call what
-------------------------------------------------------------------------------
revoke execute on function public.require_coordinator() from public, anon;
revoke execute on function public.mark_claims_paid(uuid[], int, date, text) from public, anon;
revoke execute on function public.mark_claim_unpaid(uuid) from public, anon;
revoke execute on function public.claims_report() from public, anon;
revoke execute on function public.record_claims_send(text, int, int) from public, anon;
grant execute on function public.mark_claims_paid(uuid[], int, date, text) to authenticated;
grant execute on function public.mark_claim_unpaid(uuid) to authenticated;
grant execute on function public.claims_report() to authenticated;
grant execute on function public.record_claims_send(text, int, int) to authenticated;
