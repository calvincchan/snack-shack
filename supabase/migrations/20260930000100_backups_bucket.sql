-- Private bucket for the weekly database dump. No policies on purpose: only
-- the service role (the backup workflow) can read or write it.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
