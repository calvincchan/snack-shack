-- Refunds on a To pay claim (ADR-0013, HANDOFF §4.3 and §5.9).
--
-- A refund is a row on a claim line. The purchase lines never change, so the
-- receipt photo still matches them. The claim's net is the receipt total minus
-- its refunds, and net is what the Claims screen, the CSV, the weekly email and
-- Mark paid links use.

-------------------------------------------------------------------------------
-- Table
-------------------------------------------------------------------------------
create table public.purchase_refunds (
  id               uuid primary key default gen_random_uuid(),  -- client supplies it (idempotent retries)
  purchase_line_id uuid not null references public.purchase_lines (id) on delete cascade,
  pieces           int not null check (pieces >= 1),
  amount_cents     int not null check (amount_cents > 0),       -- including tax
  refunded_on      date not null,
  slip_path        text,          -- object path in the private 'receipts' bucket
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid default public.actor()
);
create index on public.purchase_refunds (purchase_line_id);

create trigger audit after insert or update or delete on public.purchase_refunds
  for each row execute function public.audit_row('id');

alter table public.purchase_refunds enable row level security;
create policy read_all on public.purchase_refunds for select to authenticated using (public.is_member());
-- No write policies: refund_purchase_line() and undo_refund() are the only way in.

-------------------------------------------------------------------------------
-- Stock ledger: `returned` leaves stock, linked to its refund
-------------------------------------------------------------------------------
-- No foreign key: undoing a refund deletes the row, and the ledger cannot be
-- touched, so the movements keep the id of the refund they came from.
alter table public.stock_movements add column refund_id uuid;

alter table public.stock_movements drop constraint stock_movements_sign;
alter table public.stock_movements add constraint stock_movements_sign check (
  (reason in ('purchase', 'found') and qty > 0)
  or (reason in ('sold', 'out', 'missing', 'damaged', 'donated', 'returned') and qty < 0)
  or reason = 'correction'
);

-------------------------------------------------------------------------------
-- Views
-------------------------------------------------------------------------------
create or replace view public.claims with (security_invoker = true) as
select p.*,
       'SS-' || lpad(p.claim_no::text, 3, '0') as claim_label,
       (select coalesce(sum(l.cost_cents), 0) from public.purchase_lines l where l.purchase_id = p.id)::int as total_cents,
       pr.display_name as buyer_name,
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

-- What is left to refund on each line.
create or replace view public.claim_lines with (security_invoker = true) as
select l.id,
       l.purchase_id,
       l.line_no,
       l.pieces,
       l.cost_cents,
       i.name as item_name,
       l.pieces - coalesce(rf.pieces, 0)::int as pieces_left,
       l.cost_cents - coalesce(rf.cents, 0)::int as cents_left
from public.purchase_lines l
join public.items i on i.id = l.item_id
left join (select purchase_line_id, sum(pieces) as pieces, sum(amount_cents) as cents
             from public.purchase_refunds group by purchase_line_id) rf
       on rf.purchase_line_id = l.id;

create view public.claim_refunds with (security_invoker = true) as
select r.id,
       l.purchase_id,
       r.purchase_line_id,
       r.pieces,
       r.amount_cents,
       r.refunded_on,
       r.slip_path,
       r.note,
       r.created_at,
       pr.display_name as created_by_name
from public.purchase_refunds r
join public.purchase_lines l on l.id = r.purchase_line_id
left join public.profiles pr on pr.id = r.created_by;

-------------------------------------------------------------------------------
-- Functions
-------------------------------------------------------------------------------
-- "$8.00" for the error messages.
create function public.cents_text(p_cents int) returns text
language sql immutable set search_path = '' as $$
  select '$' || to_char(p_cents / 100.0, 'FM999,990.00')
$$;

-- Log a refund on a To pay claim. Errors are shown to the volunteer as-is.
create function public.refund_purchase_line(
  p_id uuid,
  p_line uuid,
  p_pieces int,
  p_amount_cents int,
  p_refunded_on date,
  p_slip_path text default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_line public.purchase_lines;
  v_claim public.purchases;
  v_buyer text;
  v_pieces_left int;
  v_cents_left int;
  v_on_hand int;
begin
  perform public.require_member();
  if exists (select 1 from public.purchase_refunds where id = p_id) then return p_id; end if;

  select * into v_line from public.purchase_lines where id = p_line for update;
  if v_line.id is null then raise exception 'That line is not on a claim.'; end if;
  -- Locked so a Mark paid link cannot be redeemed between our checks and the insert.
  select * into v_claim from public.purchases where id = v_line.purchase_id for update;
  select display_name into v_buyer from public.profiles where id = v_claim.buyer_id;

  if v_claim.status = 'paid' then raise exception 'Already paid. Ask the treasurer.'; end if;
  if v_claim.buyer_id <> auth.uid() and not public.has_role('admin') then
    raise exception 'Only % or a coordinator can refund.', v_buyer;
  end if;

  if p_pieces is null or p_pieces < 1 then raise exception 'Enter the pieces.'; end if;
  select v_line.pieces - coalesce(sum(r.pieces), 0), v_line.cost_cents - coalesce(sum(r.amount_cents), 0)
    into v_pieces_left, v_cents_left
    from public.purchase_refunds r where r.purchase_line_id = v_line.id;
  if p_pieces > v_pieces_left then raise exception 'Only % left on this line.', v_pieces_left; end if;

  select on_hand into v_on_hand from public.item_stock where id = v_line.item_id;
  if p_pieces > greatest(v_on_hand, 0) then raise exception 'Only % on hand.', greatest(v_on_hand, 0); end if;

  if exists (select 1 from public.sale_day_items sdi
               join public.sale_days sd on sd.id = sdi.sale_day_id
              where sdi.item_id = v_line.item_id and sd.phase in ('selling', 'counting')) then
    raise exception 'Refund after today''s sale closes.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter the refund amount.'; end if;
  if p_amount_cents > v_cents_left then
    raise exception 'Up to % left on this line.', public.cents_text(v_cents_left);
  end if;

  insert into public.purchase_refunds (id, purchase_line_id, pieces, amount_cents, refunded_on, slip_path, note)
  values (p_id, p_line, p_pieces, p_amount_cents, p_refunded_on,
          nullif(p_slip_path, ''), nullif(trim(coalesce(p_note, '')), ''));
  insert into public.stock_movements (item_id, qty, reason, purchase_line_id, refund_id)
  values (v_line.item_id, -p_pieces, 'returned', p_line, p_id);
  return p_id;
end $$;

-- Undo a refund while its claim is To pay: the row goes (the audit log keeps
-- it) and a correction puts the pieces back.
create function public.undo_refund(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_refund public.purchase_refunds;
  v_line public.purchase_lines;
  v_claim public.purchases;
  v_buyer text;
begin
  perform public.require_member();
  select * into v_refund from public.purchase_refunds where id = p_id for update;
  if v_refund.id is null then raise exception 'That refund is already gone.'; end if;
  select * into v_line from public.purchase_lines where id = v_refund.purchase_line_id;
  select * into v_claim from public.purchases where id = v_line.purchase_id for update;
  select display_name into v_buyer from public.profiles where id = v_claim.buyer_id;

  if v_claim.status = 'paid' then raise exception 'Already paid. Ask the treasurer.'; end if;
  if v_claim.buyer_id <> auth.uid() and not public.has_role('admin') then
    raise exception 'Only % or a coordinator can undo a refund.', v_buyer;
  end if;

  delete from public.purchase_refunds where id = p_id;
  insert into public.stock_movements (item_id, qty, reason, purchase_line_id, refund_id, note)
  values (v_line.item_id, v_refund.pieces, 'correction', v_line.id, p_id, 'Refund undone');
end $$;

revoke execute on function public.refund_purchase_line(uuid, uuid, int, int, date, text, text) from public, anon;
revoke execute on function public.undo_refund(uuid) from public, anon;
grant execute on function public.refund_purchase_line(uuid, uuid, int, int, date, text, text) to authenticated;
grant execute on function public.undo_refund(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Weekly email and Mark paid links use net
-------------------------------------------------------------------------------
create or replace function public.weekly_treasurer_report(p_week_start date default public.treasurer_report_week())
returns jsonb language sql stable security definer set search_path = '' as $$
  with dep as (
    select t.sale_date, t.deposit_cents, t.over_short_cents,
           coalesce((select string_agg(p.display_name, ', ' order by s.signed_at)
                       from public.sale_day_signoffs s
                       join public.profiles p on p.id = s.user_id
                      where s.sale_day_id = t.sale_day_id), '') as volunteers
      from public.sale_day_totals t
     where t.phase = 'closed'
       and t.sale_date between p_week_start and p_week_start + 6
  ), owed as (
    select c.buyer_id, c.buyer_name, sum(c.net_cents)::int as total_cents,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'label', c.claim_label, 'purchased_on', c.purchased_on,
             'store', c.store, 'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
             'receipt_path', c.receipt_path) order by c.claim_no) as claims
      from public.claims c
     where c.status = 'to_pay' and c.net_cents > 0
     group by c.buyer_id, c.buyer_name
  )
  select jsonb_build_object(
    'week_start', p_week_start,
    'deposits', coalesce((select jsonb_agg(to_jsonb(dep) order by dep.sale_date) from dep), '[]'),
    'deposited_cents', coalesce((select sum(deposit_cents) from dep), 0)::int,
    'to_reimburse', coalesce((select jsonb_agg(to_jsonb(owed) order by owed.buyer_name) from owed), '[]'),
    'to_reimburse_cents', coalesce((select sum(total_cents) from owed), 0)::int,
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.claim_label, 'purchased_on', c.purchased_on, 'store', c.store,
        'buyer_name', c.buyer_name, 'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
        'status', case when c.status = 'to_pay' and c.net_cents = 0 then 'refunded' else c.status::text end,
        'paid_at', c.paid_at, 'payment_ref', c.payment_ref) order by c.claim_no)
      from public.claims c), '[]')
  )
$$;

-- The link stores the total it was issued for (`total_cents` in the payload).
create or replace function public.issue_mark_paid_tokens(p_valid interval default interval '7 days')
returns table (buyer_id uuid, buyer_name text, total_cents int, purchase_ids uuid[], token text)
language plpgsql security definer set search_path = '' as $$
declare
  v_treasurer uuid;
  r record;
  v_token text;
begin
  select id into v_treasurer from public.profiles where role = 'treasurer' and active limit 1;
  if v_treasurer is null then raise exception 'No active treasurer account.'; end if;
  for r in
    select c.buyer_id, c.buyer_name, sum(c.net_cents)::int as total, array_agg(c.id order by c.claim_no) as ids
    from public.claims c where c.status = 'to_pay' and c.net_cents > 0
    group by c.buyer_id, c.buyer_name
  loop
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.action_tokens (token_hash, purpose, payload, issued_to, expires_at)
    values (encode(extensions.digest(v_token, 'sha256'), 'hex'), 'mark_paid',
            jsonb_build_object('buyer_id', r.buyer_id, 'purchase_ids', to_jsonb(r.ids), 'total_cents', r.total),
            v_treasurer, now() + p_valid);
    buyer_id := r.buyer_id; buyer_name := r.buyer_name; total_cents := r.total;
    purchase_ids := r.ids; token := v_token;
    return next;
  end loop;
end $$;

-- Refuse a link whose total no longer matches what the claims owe.
create or replace function public.redeem_action_token(p_token text, p_payment_ref text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.action_tokens;
  v_count int;
  v_name text;
  v_now_cents int;
begin
  select * into t from public.action_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if t.id is null then raise exception 'This link is not valid.' using errcode = 'SS001'; end if;
  if t.used_at is not null then raise exception 'This link has already been used.' using errcode = 'SS002'; end if;
  if t.expires_at < now() then raise exception 'This link has expired. Use the latest weekly email.' using errcode = 'SS003'; end if;

  if t.payload ? 'total_cents' then
    -- Lock the claims so a refund cannot land between this check and the update.
    perform 1 from public.purchases
     where id in (select jsonb_array_elements_text(t.payload -> 'purchase_ids')::uuid) for update;
    select coalesce(sum(c.net_cents), 0) into v_now_cents
      from public.claims c
     where c.id in (select jsonb_array_elements_text(t.payload -> 'purchase_ids')::uuid);
    if v_now_cents <> (t.payload ->> 'total_cents')::int then
      raise exception 'The amount changed since this email. Check before you send money; use next week''s email.'
        using errcode = 'SS004';
    end if;
  end if;

  perform set_config('app.actor', t.issued_to::text, true);
  update public.purchases
     set status = 'paid', paid_at = now(), paid_by = t.issued_to,
         payment_ref = coalesce(p_payment_ref, 'E-transfer')
   where id in (select jsonb_array_elements_text(t.payload -> 'purchase_ids')::uuid)
     and status = 'to_pay';
  get diagnostics v_count = row_count;
  update public.action_tokens set used_at = now() where id = t.id;

  select display_name into v_name from public.profiles where id = (t.payload ->> 'buyer_id')::uuid;
  return jsonb_build_object('purchases_paid', v_count, 'buyer_id', t.payload ->> 'buyer_id', 'buyer_name', v_name);
end $$;
