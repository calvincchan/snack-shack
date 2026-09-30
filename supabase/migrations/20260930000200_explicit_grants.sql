-- New hosted Supabase projects no longer hand out table privileges on the
-- public schema by default (local Supabase still does), so a production
-- database built from the migrations alone had signed-in users locked out of
-- every table. Grant them explicitly. Functions are left alone: some are
-- deliberately restricted to service_role. Row level security still decides which
-- rows anyone sees; anon gets nothing.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant usage, select on all sequences in schema public
  to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
