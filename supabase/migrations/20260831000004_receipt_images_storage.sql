-- レシート画像用の非公開Storageバケット。
-- パス構成は {group_id}/{receipt_id}/{uuid}.{ext} とし、パス先頭のgroup_idセグメントが
-- 所属グループと一致する場合のみアクセスを許可する（stores等と同じmy_group_ids()を利用）。

insert into storage.buckets (id, name, public)
values ('receipt-images', 'receipt-images', false)
on conflict (id) do nothing;

create policy "member can read own group receipt images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_group_ids())
  );

create policy "member can write own group receipt images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_group_ids())
  );

create policy "member can delete own group receipt images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_group_ids())
  );
