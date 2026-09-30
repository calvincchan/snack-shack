-- The backups bucket is private and has no policy for signed-in members.
begin;
select plan(2);

select is(
  (select public from storage.buckets where id = 'backups'),
  false,
  'backups bucket is private'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and qual like '%backups%'),
  0,
  'no policy grants access to backups'
);

select * from finish();
rollback;
