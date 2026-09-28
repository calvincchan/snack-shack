-- Sign-in and the coordinator's team list.
--
-- Volunteers sign in with an email magic link. The coordinator adds people by
-- email, which may happen before or after that person has ever signed in, so
-- there are two halves that meet in the middle:
--
--   add_volunteer()          -> profile if the auth user exists, else an invite
--   trigger on auth.users    -> turns a matching open invite into a profile
--
-- The very first person to sign in on an empty database becomes the
-- coordinator, otherwise nobody could add anyone. See docs/adr/0011.

-------------------------------------------------------------------------------
-- Profiles gain the email the coordinator typed
-------------------------------------------------------------------------------
alter table public.profiles add column email text;

update public.profiles p
   set email = lower(u.email)
  from auth.users u
 where u.id = p.id;

create unique index profiles_email_key on public.profiles (lower(email));

-- Stamp settings edits so the audit log shows who changed the change float.
create function public.settings_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := public.actor();
  return new;
end $$;
create trigger settings_touch before update on public.settings
  for each row execute function public.settings_touch();

-------------------------------------------------------------------------------
-- Invites: a volunteer the coordinator added who has not signed in yet
-------------------------------------------------------------------------------
create table public.volunteer_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (position('@' in email) > 1),
  display_name text not null check (length(trim(display_name)) > 0),
  role         public.user_role not null default 'volunteer',
  created_at   timestamptz not null default now(),
  created_by   uuid default public.actor(),
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id)
);
-- At most one open invite per email address.
create unique index volunteer_invites_open
  on public.volunteer_invites (lower(email)) where accepted_at is null;

create trigger audit after insert or update or delete on public.volunteer_invites
  for each row execute function public.audit_row('id');

-------------------------------------------------------------------------------
-- Adding a volunteer
-------------------------------------------------------------------------------
-- Returns {"status": "added"} when the person already has an account and can
-- use the app now, or {"status": "invited"} when they still have to sign in.
create function public.add_volunteer(
  p_email text,
  p_name  text,
  p_role  public.user_role default 'volunteer'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_name  text := trim(p_name);
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
    insert into public.profiles (id, email, display_name, role, active)
    values (v_uid, v_email, v_name, p_role, true)
    on conflict (id) do update
      set email        = excluded.email,
          display_name = excluded.display_name,
          role         = excluded.role,
          active       = true;
    return jsonb_build_object('status', 'added', 'profile_id', v_uid);
  end if;

  insert into public.volunteer_invites (email, display_name, role)
  values (v_email, v_name, p_role)
  on conflict (lower(email)) where accepted_at is null do update
    set display_name = excluded.display_name,
        role         = excluded.role;
  return jsonb_build_object('status', 'invited');
end $$;

-------------------------------------------------------------------------------
-- First sign-in: bootstrap the coordinator, or accept an invite
-------------------------------------------------------------------------------
create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
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

  insert into public.profiles (id, email, display_name, role, active)
  values (new.id, v_email, v_invite.display_name, v_invite.role, true)
  on conflict (id) do nothing;

  update public.volunteer_invites
     set accepted_at = now(), accepted_by = new.id
   where id = v_invite.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-------------------------------------------------------------------------------
-- The team always keeps a coordinator
-------------------------------------------------------------------------------
create function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active and new.id = auth.uid() then
    raise exception 'You cannot remove yourself from the team.';
  end if;
  if old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles
                      where role = 'admin' and active and id <> old.id) then
    raise exception 'The team needs at least one coordinator.';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
-- Volunteers leave the team by being deactivated, never deleted, so the audit
-- trail keeps their name. Replace the blanket admin policy with insert/update
-- only; cascades from auth.users still work because they bypass RLS.
drop policy admin_write on public.profiles;
create policy admin_insert on public.profiles for insert to authenticated
  with check (public.has_role('admin'));
create policy admin_update on public.profiles for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

alter table public.volunteer_invites enable row level security;
create policy admin_read on public.volunteer_invites for select to authenticated
  using (public.has_role('admin'));
create policy admin_delete on public.volunteer_invites for delete to authenticated
  using (public.has_role('admin'));
-- Invites are created by add_volunteer() only.
