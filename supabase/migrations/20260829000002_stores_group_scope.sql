-- storesをグループ単位のデータに変更する。
-- 取引種別・消費税・カテゴリ・目的・シーンは今回は変更せずグローバル共有のまま維持する
-- （将来グループ固有化する場合は、このマイグレーションと同じ型で追加できる）。

alter table public.stores
  add column group_id uuid references public.groups (id) on delete cascade;

-- 既存のグローバル一意制約(name)を、グループ内での一意制約に置き換える。
-- 実データが存在しない開発中の前提のため、バックフィルなしで一気にnot null化する。
alter table public.stores drop constraint stores_name_key;
alter table public.stores add constraint stores_group_name_uniq unique (group_id, name);
alter table public.stores alter column group_id set not null;

-- 「authenticatedなら誰でも参照可能」という既存ポリシーを、グループ単位の
-- 読み取り/管理者のみ書き込み可能なポリシーに置き換える。
drop policy "authenticated can read stores" on public.stores;

create policy "member can read own group stores"
  on public.stores for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

create policy "admin can write own group stores"
  on public.stores for all
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));
