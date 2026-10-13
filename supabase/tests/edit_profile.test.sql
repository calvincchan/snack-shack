-- Editing your own profile, team members and invites (pgTAP, ADR-0014).
-- Run with: supabase test db
begin;
select plan(30);

set local client_min_messages = warning;
truncate table auth.users, public.items, public.sale_days cascade;

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

-- Calvin (coordinator), Yuki (volunteer), Priya (removed), and one open invite.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'calvin@example.com');
update public.profiles set display_name = 'Calvin'
 where id = '00000000-0000-0000-0000-00000000000a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'priya@example.com');
insert into public.profiles (id, email, display_name, role, active) values
  ('00000000-0000-0000-0000-00000000000b', 'yuki@example.com',  'Yuki',  'volunteer', true),
  ('00000000-0000-0000-0000-00000000000c', 'priya@example.com', 'Priya', 'volunteer', false);
insert into public.volunteer_invites (id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'sam@example.com', 'Sam', 'volunteer');

set local role authenticated;

-- A volunteer edits their own profile -----------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');

select lives_ok($$ select public.update_my_profile(' Yuki T ', ' Yukiko Tanaka ') $$,
                'a volunteer edits their own names');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
          'Yuki T', 'the display name is trimmed');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
          'Yukiko Tanaka', 'the full name is trimmed');

select lives_ok($$ select public.update_my_profile('yuki t', '  ') $$,
                'changing only the case of your own name is fine');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
          null, 'a blank full name clears it');

select throws_like($$ select public.update_my_profile('  ') $$,
                   '%Enter a name%', 'the display name is required');
select throws_like($$ select public.update_my_profile(repeat('x', 31)) $$,
                   '%30 characters%', 'the display name is at most 30 characters');
select lives_ok($$ select public.update_my_profile(repeat('x', 30)) $$,
                '30 characters is fine');
select throws_like($$ select public.update_my_profile('Yuki', repeat('x', 101)) $$,
                   '%100 characters%', 'the full name is at most 100 characters');
select throws_like($$ select public.update_my_profile('CALVIN') $$,
                   '%already uses that name%', 'a teammate''s name is taken, whatever the case');
select throws_like($$ select public.update_my_profile('priya') $$,
                   '%already uses that name%', 'so is the name of someone removed');
select throws_like($$ select public.update_my_profile('Sam') $$,
                   '%already uses that name%', 'so is the name on an open invite');

update public.profiles set role = 'admin', active = true
 where id = '00000000-0000-0000-0000-00000000000b';
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
          'volunteer', 'a volunteer cannot change their own role directly');
select is((select count(*)::int from public.profiles where display_name = 'Calvin'),
          1, 'a volunteer cannot rename anyone else');
select throws_like($$ select public.update_team_member('00000000-0000-0000-0000-00000000000b', 'Yuki', null, 'admin') $$,
                   '%Only the coordinator%', 'nor through the coordinator''s function');
select throws_like($$ select public.update_invite('00000000-0000-0000-0000-0000000000f1', 'Sammy', null, 'admin') $$,
                   '%Only the coordinator%', 'volunteers cannot edit invites');

-- Someone removed cannot edit their profile -----------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select throws_like($$ select public.update_my_profile('Priya P') $$,
                   '%Ask the coordinator%', 'a removed person cannot edit their profile');

-- The coordinator edits a team member -----------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

select lives_ok($$ select public.update_team_member('00000000-0000-0000-0000-00000000000b', ' Yuki ', ' Yukiko ', 'treasurer') $$,
                'the coordinator edits names and role together');
select is((select display_name || '|' || full_name || '|' || role
             from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
          'Yuki|Yukiko|treasurer', 'all three changed');
select throws_like($$ select public.update_team_member('00000000-0000-0000-0000-00000000000b', 'Calvin', null, 'volunteer') $$,
                   '%already uses that name%', 'the coordinator cannot give someone a taken name');
select throws_like($$ select public.update_team_member('00000000-0000-0000-0000-00000000000a', 'Calvin', null, 'volunteer') $$,
                   '%at least one coordinator%', 'the last coordinator keeps the role');
select lives_ok($$ select public.update_my_profile('Calvin C', 'Chun Yu Chan') $$,
                'the coordinator edits their own profile too');

-- The coordinator edits an invite ---------------------------------------------
select lives_ok($$ select public.update_invite('00000000-0000-0000-0000-0000000000f1', ' Sammy ', ' Samuel Lee ', 'treasurer') $$,
                'the coordinator edits an invite');
select is((select display_name || '|' || full_name || '|' || role
             from public.volunteer_invites where id = '00000000-0000-0000-0000-0000000000f1'),
          'Sammy|Samuel Lee|treasurer', 'the invite changed');
select throws_like($$ select public.update_invite('00000000-0000-0000-0000-0000000000f1', 'yuki', null, 'volunteer') $$,
                   '%already uses that name%', 'an invite cannot take a teammate''s name');

-- Adding someone already there points at the edit -----------------------------
select throws_like($$ select public.add_volunteer('YUKI@example.com', 'Yuki 2') $$,
                   '%Already on the team%', 'adding a teammate''s email is refused');
select throws_like($$ select public.add_volunteer('priya@example.com', 'Priya') $$,
                   '%Tap Add back%', 'adding a removed person''s email points at Add back');
select throws_like($$ select public.add_volunteer('sam@example.com', 'Sam') $$,
                   '%Already invited%', 'adding an invited email points at the invite');
select throws_like($$ select public.add_volunteer('new@example.com', 'sammy') $$,
                   '%already uses that name%', 'a new volunteer cannot take an invite''s name');

-- Accepted invites stop editing ----------------------------------------------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'sam@example.com');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_like($$ select public.update_invite('00000000-0000-0000-0000-0000000000f1', 'Sam', null, 'volunteer') $$,
                   '%invite is gone%', 'an accepted invite cannot be edited');

select * from finish();
rollback;
