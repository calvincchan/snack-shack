-- Weekly treasurer email (ADR-0007, HANDOFF §5.9).
--
-- Postgres builds the facts: last week's deposits and every claim still to pay,
-- grouped per volunteer. The `weekly-treasurer-email` Edge Function words them,
-- issues the one-time links, signs the receipt URLs and sends the email.
-- pg_cron wakes the function twice on Monday mornings (07:00 Vancouver is
-- 14:00 or 15:00 UTC depending on daylight saving); the function sends only
-- when it is 07:00 in Vancouver.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The Monday that started the week before p_now, in Vancouver.
create function public.treasurer_report_week(p_now timestamptz default now())
returns date language sql stable set search_path = '' as $$
  select (date_trunc('week', p_now at time zone 'America/Vancouver'))::date - 7
$$;

-- Deposits for the sale days in the week from p_week_start (Monday to Sunday),
-- what is still to reimburse per volunteer, and the whole ledger for the CSV.
create function public.weekly_treasurer_report(p_week_start date default public.treasurer_report_week())
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
    select c.buyer_id, c.buyer_name, sum(c.total_cents)::int as total_cents,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'label', c.claim_label, 'purchased_on', c.purchased_on,
             'store', c.store, 'total_cents', c.total_cents,
             'receipt_path', c.receipt_path) order by c.claim_no) as claims
      from public.claims c
     where c.status = 'to_pay'
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
        'buyer_name', c.buyer_name, 'total_cents', c.total_cents, 'status', c.status,
        'paid_at', c.paid_at, 'payment_ref', c.payment_ref) order by c.claim_no)
      from public.claims c), '[]')
  )
$$;

revoke execute on function public.weekly_treasurer_report(date) from public, anon, authenticated;
grant execute on function public.weekly_treasurer_report(date) to service_role;

-- Called by pg_cron. The project URL and the service role key live in Vault
-- (names `project_url` and `service_role_key`); until production sets them the
-- job does nothing, so local development and CI stay quiet.
create function public.invoke_weekly_treasurer_email()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'Weekly treasurer email not scheduled: add project_url and service_role_key to Vault.';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/weekly-treasurer-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('scheduled', true)
  );
end $$;

revoke execute on function public.invoke_weekly_treasurer_email() from public, anon, authenticated;

select cron.schedule('weekly-treasurer-email', '0 14,15 * * 1', 'select public.invoke_weekly_treasurer_email()');
