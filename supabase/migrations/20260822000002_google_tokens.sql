-- Google Drive連携用のOAuthトークン保存テーブル。
-- Supabase Authはprovider_token/provider_refresh_tokenをセッション確立時に一時的に返すのみで
-- 永続化しないため、Google Driveアップロード機能のために自前で保存する。
-- 機密トークンを扱うため、PostgREST公開API(anon/authenticatedロール)からは一切アクセスさせず、
-- サーバー側のservice_roleクライアント経由でのみ読み書きする設計とする。

create table public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  token_type text,
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

-- ポリシーを一切作成しないことで、anon/authenticatedロールからのアクセスをデフォルト拒否する。
revoke all on public.google_tokens from anon, authenticated;
grant all on public.google_tokens to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger google_tokens_set_updated_at
  before update on public.google_tokens
  for each row
  execute function public.set_updated_at();
