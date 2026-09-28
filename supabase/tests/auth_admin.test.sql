-- Sign-in, the team list and the admin-only rules (pgTAP).
-- Run with: supabase test db
begin;
select plan(25);

-- The seed fills the database for local development. These tests describe
-- behaviour from an empty start, so clear it inside the transaction.
set local client_min_messages = warning;
truncate table auth.users, public.items cascade;
alter table public.purchases alter column claim_no restart with 1;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- The first person to sign in becomes the coordinator -------------------------
select is((select count(*)::int from public.profiles), 0, 'no team yet');

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com');

select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
          'admin', 'first sign-in becomes the coordinator');
select is((select active from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
          true, 'the coordinator is active');
select is((select email from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
          'calvin@example.com', 'the profile keeps the email');

-- The second person signs in with no invite -----------------------------------
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000d', 'stranger@example.com');

select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
          0, 'someone with no invite gets no profile');
select is((select public.is_member()), false, 'and is not a member');

-- The coordinator adds someone who has never signed in ------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

select is((select public.add_volunteer('Yuki@Example.com ', ' Yuki ') ->> 'status'),
          'invited', 'adding a new email creates an invite');
select is((select email from public.volunteer_invites), 'yuki@example.com',
          'the email is stored lowercased and trimmed');
select is((select display_name from public.volunteer_invites), 'Yuki', 'the name is trimmed');
select lives_ok($$ select public.add_volunteer('yuki@example.com', 'Yuki Tanaka') $$,
                'adding the same email again corrects the invite');
select is((select count(*)::int from public.volunteer_invites), 1, 'still one invite');
select is((select display_name from public.volunteer_invites), 'Yuki Tanaka', 'the name was corrected');

select throws_like($$ select public.add_volunteer('nope', 'Nobody') $$,
                   '%Enter an email address%', 'the email must look like an email');
select throws_like($$ select public.add_volunteer('someone@example.com', '  ') $$,
                   '%Enter a name%', 'the name is required');

reset role;
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com');

select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
          'Yuki Tanaka', 'signing in turns the invite into a profile');
select isnt((select accepted_at from public.volunteer_invites), null, 'the invite is marked accepted');

-- The coordinator adds someone who is already signed in -----------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

select is((select public.add_volunteer('stranger@example.com', 'Sam', 'volunteer') ->> 'status'),
          'added', 'adding an email that already signed in creates the profile directly');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
          'Sam', 'Sam is on the team now');

-- Only the coordinator can manage people and settings -------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

select throws_like($$ select public.add_volunteer('new@example.com', 'New') $$,
                   '%Only the coordinator%', 'volunteers cannot add volunteers');
select is((select count(*)::int from public.volunteer_invites), 0, 'volunteers cannot read invites');
update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000d';
select is((select active from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
          true, 'RLS ignores a volunteer deactivating someone');
update public.settings set float_cents = 5000;
select is((select float_cents from public.settings), 3000, 'RLS ignores a volunteer editing settings');

-- The coordinator can, within limits ------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.settings set float_cents = 5000;
select is((select float_cents from public.settings), 5000, 'the coordinator changes the change float');

select throws_like($$ update public.profiles set active = false
                       where id = '00000000-0000-0000-0000-00000000000a' $$,
                   '%cannot remove yourself%', 'the coordinator cannot remove themselves');

update public.profiles set active = false where id = '00000000-0000-0000-0000-00000000000b';
select is((select active from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
          false, 'the coordinator deactivates a volunteer');

select * from finish();
rollback;
