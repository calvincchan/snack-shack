-- Private bucket for receipt photos. Paths: receipts/<purchase id>/<file name>
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "members read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_member());

create policy "members upload receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_member());
