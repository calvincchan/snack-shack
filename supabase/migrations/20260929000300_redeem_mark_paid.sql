-- Redeeming a Mark paid link (ADR-0007, HANDOFF §5.9).
--
-- The tiny /mark-paid page needs to tell "already used" and "expired" apart
-- from "not valid", and to say whose receipts were paid. Each failure now has
-- its own SQLSTATE and the result carries the volunteer's name.

create or replace function public.redeem_action_token(p_token text, p_payment_ref text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.action_tokens;
  v_count int;
  v_name text;
begin
  select * into t from public.action_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if t.id is null then raise exception 'This link is not valid.' using errcode = 'SS001'; end if;
  if t.used_at is not null then raise exception 'This link has already been used.' using errcode = 'SS002'; end if;
  if t.expires_at < now() then raise exception 'This link has expired. Use the latest weekly email.' using errcode = 'SS003'; end if;

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
