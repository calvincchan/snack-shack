-- Edit profile (ADR-0014).
--
-- A signed-in person edits their own display name and full name; the
-- coordinator edits anyone's name, full name and role, and edits open invites.
-- Every write goes through a function, so the rules live here: names are
-- trimmed, short enough for a phone screen, and no two people on the team (or
-- waiting to sign in) share a display name. Direct writes to profiles from the
-- app are no longer allowed.

-------------------------------------------------------------------------------
-- Limits
-------------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) <= 30),
  add constraint profiles_full_name_length check (char_length(full_name) <= 100);

alter table public.volunteer_invites
  add constraint volunteer_invites_display_name_length check (char_length(display_name) <= 30),
  add constraint volunteer_invites_full_name_length check (char_length(full_name) <= 100);

-- Backstops for the checks in display_name_check(); it also looks across tables.
create unique index profiles_display_name_key on public.profiles (lower(display_name));
create unique index volunteer_invites_display_name_open
  on public.volunteer_invites (lower(display_name)) where accepted_at is null;

-------------------------------------------------------------------------------
-- Shared name rules
-------------------------------------------------------------------------------
-- Raises the message a volunteer sees, or returns nothing. p_profile and
-- p_invite are the row being edited, so keeping your own name is fine.
create function public.display_name_check(p_name text, p_profile uuid, p_invite uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_name is null or p_name = '' then
    raise exception 'Enter a name.';
  end if;
  if char_length(p_name) > 30 then
    raise exception 'Keep the name to 30 characters or fewer.';
  end if;
  if exists (select 1 from public.profiles
              where lower(display_name) = lower(p_name)
                and id is distinct from p_profile)
     or exists (select 1 from public.volunteer_invites
                 where lower(display_name) = lower(p_name)
                   and accepted_at is null
                   and id is distinct from p_invite) then
    raise exception 'Someone on the team already uses that name.';
  end if;
end $$;

create function public.full_name_check(p_full_name text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if char_length(p_full_name) > 100 then
    raise exception 'Keep the full name to 100 characters or fewer.';
  end if;
end $$;

revoke execute on function public.display_name_check(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.full_name_check(text) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Editing your own profile
-------------------------------------------------------------------------------
create function public.update_my_profile(p_display_name text, p_full_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(p_display_name);
  v_full text := nullif(trim(p_full_name), '');
begin
  if not public.is_member() then
    raise exception 'Ask the coordinator to add you to the team.';
  end if;
  perform public.display_name_check(v_name, auth.uid(), null);
  perform public.full_name_check(v_full);

  update public.profiles
     set display_name = v_name, full_name = v_full
   where id = auth.uid();
end $$;

-------------------------------------------------------------------------------
-- The coordinator edits a team member
-------------------------------------------------------------------------------
create function public.update_team_member(
  p_id           uuid,
  p_display_name text,
  p_full_name    text,
  p_role         public.user_role
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(p_display_name);
  v_full text := nullif(trim(p_full_name), '');
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can edit the team.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'That person is not on the team list.';
  end if;
  perform public.display_name_check(v_name, p_id, null);
  perform public.full_name_check(v_full);

  -- profiles_guard still keeps at least one coordinator.
  update public.profiles
     set display_name = v_name, full_name = v_full, role = p_role
   where id = p_id;
end $$;

create function public.set_member_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can edit the team.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'That person is not on the team list.';
  end if;

  -- profiles_guard stops you removing yourself or the last coordinator.
  update public.profiles set active = p_active where id = p_id;
end $$;

-------------------------------------------------------------------------------
-- The coordinator edits an invite that is still waiting
-------------------------------------------------------------------------------
create function public.update_invite(
  p_id           uuid,
  p_display_name text,
  p_full_name    text,
  p_role         public.user_role
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(p_display_name);
  v_full text := nullif(trim(p_full_name), '');
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can edit the team.';
  end if;
  if not exists (select 1 from public.volunteer_invites
                  where id = p_id and accepted_at is null) then
    raise exception 'That invite is gone. They may have signed in already.';
  end if;
  perform public.display_name_check(v_name, null, p_id);
  perform public.full_name_check(v_full);

  update public.volunteer_invites
     set display_name = v_name, full_name = v_full, role = p_role
   where id = p_id;
end $$;

-------------------------------------------------------------------------------
-- Adding a volunteer no longer edits someone already there
-------------------------------------------------------------------------------
create or replace function public.add_volunteer(
  p_email     text,
  p_name      text,
  p_role      public.user_role default 'volunteer',
  p_full_name text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email   text := lower(trim(p_email));
  v_name    text := trim(p_name);
  v_full    text := nullif(trim(p_full_name), '');
  v_uid     uuid;
  v_profile public.profiles;
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can add volunteers.';
  end if;
  if position('@' in v_email) < 2 then
    raise exception 'Enter an email address.';
  end if;

  select * into v_profile from public.profiles where lower(email) = v_email;
  if v_profile.id is not null and v_profile.active then
    raise exception 'Already on the team. Tap their name to edit.';
  elsif v_profile.id is not null then
    raise exception 'Removed from the team. Tap Add back.';
  end if;
  if exists (select 1 from public.volunteer_invites
              where lower(email) = v_email and accepted_at is null) then
    raise exception 'Already invited. Tap the invite to edit.';
  end if;

  perform public.display_name_check(v_name, null, null);
  perform public.full_name_check(v_full);

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    insert into public.profiles (id, email, display_name, full_name, role, active)
    values (v_uid, v_email, v_name, v_full, p_role, true);
    return jsonb_build_object('status', 'added', 'profile_id', v_uid);
  end if;

  insert into public.volunteer_invites (email, display_name, full_name, role)
  values (v_email, v_name, v_full, p_role);
  return jsonb_build_object('status', 'invited');
end $$;

-------------------------------------------------------------------------------
-- The first coordinator's name, from their email, fits the limit
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
            left(coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Coordinator'), 30),
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
-- Writes go through the functions above
-------------------------------------------------------------------------------
drop policy admin_insert on public.profiles;
drop policy admin_update on public.profiles;

revoke execute on function public.update_my_profile(text, text) from public, anon;
revoke execute on function public.update_team_member(uuid, text, text, public.user_role) from public, anon;
revoke execute on function public.set_member_active(uuid, boolean) from public, anon;
revoke execute on function public.update_invite(uuid, text, text, public.user_role) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.update_team_member(uuid, text, text, public.user_role) to authenticated;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;
grant execute on function public.update_invite(uuid, text, text, public.user_role) to authenticated;
