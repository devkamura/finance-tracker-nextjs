-- マスタデータ用テーブル群
-- 「該当なし」店舗はUI側の定数(SELECT_NONE_VALUE)として扱うため、ここには保存しない

create table public.stores (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public.transaction_types (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public.consumption_taxes (
  id bigint generated always as identity primary key,
  name text not null unique,
  multiplier numeric(4, 2) not null
);

create table public.categories (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public.purposes (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public.scenes (
  id bigint generated always as identity primary key,
  name text not null unique
);

alter table public.stores enable row level security;
alter table public.transaction_types enable row level security;
alter table public.consumption_taxes enable row level security;
alter table public.categories enable row level security;
alter table public.purposes enable row level security;
alter table public.scenes enable row level security;

-- マスタデータはログイン済みユーザーなら誰でも参照可能。
-- 書き込みポリシーは用意しない(service_role経由のシード投入のみを許可する)。
create policy "authenticated can read stores"
  on public.stores for select
  to authenticated
  using (true);

create policy "authenticated can read transaction_types"
  on public.transaction_types for select
  to authenticated
  using (true);

create policy "authenticated can read consumption_taxes"
  on public.consumption_taxes for select
  to authenticated
  using (true);

create policy "authenticated can read categories"
  on public.categories for select
  to authenticated
  using (true);

create policy "authenticated can read purposes"
  on public.purposes for select
  to authenticated
  using (true);

create policy "authenticated can read scenes"
  on public.scenes for select
  to authenticated
  using (true);
