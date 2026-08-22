-- ユーザーの表示名を管理するテーブル。
-- レシートJSONのuser項目にメールアドレスの代わりに表示名を出力するために使用する。

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 本人の行のみ参照・更新可能（他ユーザーの表示名は見えない/変更できない）。
create policy "user can read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "user can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- 新規ユーザーがGoogleでサインアップした際、Googleアカウントの表示名を
-- 初期値としてprofilesへ自動登録する（本人はあとから画面で変更可能）。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email,
      'unknown'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 既存ユーザー（このマイグレーション適用前にサインアップ済みのユーザー）を
-- 同じ規則でバックフィルする。
insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    raw_user_meta_data ->> 'full_name',
    raw_user_meta_data ->> 'name',
    email,
    'unknown'
  )
from auth.users
on conflict (id) do nothing;
