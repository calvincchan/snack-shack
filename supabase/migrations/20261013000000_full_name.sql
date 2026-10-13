-- Full name (HANDOFF §5.9).
--
-- The treasurer pays by e-transfer and needs the name on the bank account,
-- which is often not what the team calls someone ("Calvin C" is "Chun Yu Chan").
-- display_name stays short for the app; full_name is optional and only the
-- weekly email and its CSV show it, as "Calvin C (Chun Yu Chan)".

-------------------------------------------------------------------------------
-- Columns
-------------------------------------------------------------------------------
alter table public.profiles
  add column full_name text
  constraint profiles_full_name_check check (full_name is null or length(trim(full_name)) > 0);

alter table public.volunteer_invites
  add column full_name text
  constraint volunteer_invites_full_name_check check (full_name is null or length(trim(full_name)) > 0);

-------------------------------------------------------------------------------
-- Adding a volunteer takes an optional full name
-------------------------------------------------------------------------------
drop function public.add_volunteer(text, text, public.user_role);

create function public.add_volunteer(
  p_email     text,
  p_name      text,
  p_role      public.user_role default 'volunteer',
  p_full_name text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_name  text := trim(p_name);
  v_full  text := nullif(trim(p_full_name), '');
  v_uid   uuid;
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can add volunteers.';
  end if;
  if position('@' in v_email) < 2 then
    raise exception 'Enter an email address.';
  end if;
  if v_name = '' then
    raise exception 'Enter a name.';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    insert into public.profiles (id, email, display_name, full_name, role, active)
    values (v_uid, v_email, v_name, v_full, p_role, true)
    on conflict (id) do update
      set email        = excluded.email,
          display_name = excluded.display_name,
          full_name    = coalesce(excluded.full_name, public.profiles.full_name),
          role         = excluded.role,
          active       = true;
    return jsonb_build_object('status', 'added', 'profile_id', v_uid);
  end if;

  insert into public.volunteer_invites (email, display_name, full_name, role)
  values (v_email, v_name, v_full, p_role)
  on conflict (lower(email)) where accepted_at is null do update
    set display_name = excluded.display_name,
        full_name    = excluded.full_name,
        role         = excluded.role;
  return jsonb_build_object('status', 'invited');
end $$;

-------------------------------------------------------------------------------
-- An accepted invite carries the full name into the profile
-------------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(new.email);
  v_invite public.volunteer_invites;
begin
  -- Empty team: whoever signs in first is the coordinator.
  if not exists (select 1 from public.profiles) then
    insert into public.profiles (id, email, display_name, role, active)
    values (new.id, v_email,
            coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Coordinator'),
            'admin', true)
    on conflict (id) do nothing;
    return new;
  end if;

  select * into v_invite
    from public.volunteer_invites
   where lower(email) = v_email and accepted_at is null
   order by created_at
   limit 1;

  -- No invite: they sign in but see "Ask the coordinator to add you".
  if v_invite.id is null then
    return new;
  end if;

  insert into public.profiles (id, email, display_name, full_name, role, active)
  values (new.id, v_email, v_invite.display_name, v_invite.full_name, v_invite.role, true)
  on conflict (id) do nothing;

  update public.volunteer_invites
     set accepted_at = now(), accepted_by = new.id
   where id = v_invite.id;
  return new;
end $$;

-------------------------------------------------------------------------------
-- The weekly email shows it beside the display name
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
    select c.buyer_id, c.buyer_name, pr.full_name as buyer_full_name,
           sum(c.net_cents)::int as total_cents,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'label', c.claim_label, 'purchased_on', c.purchased_on,
             'store', c.store, 'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
             'receipt_path', c.receipt_path) order by c.claim_no) as claims
      from public.claims c
      join public.profiles pr on pr.id = c.buyer_id
     where c.status = 'to_pay' and c.net_cents > 0
     group by c.buyer_id, c.buyer_name, pr.full_name
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
        'buyer_name', c.buyer_name, 'buyer_full_name', pr.full_name,
        'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
        'status', case when c.status = 'to_pay' and c.net_cents = 0 then 'refunded' else c.status::text end,
        'paid_at', c.paid_at, 'payment_ref', c.payment_ref) order by c.claim_no)
      from public.claims c
      join public.profiles pr on pr.id = c.buyer_id), '[]')
  )
$$;
