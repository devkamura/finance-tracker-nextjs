-- レシートのGoogle Driveアップロード機能を廃止したため、Google OAuthの
-- access_token/refresh_tokenを保持していたgoogle_tokensテーブルは不要になった。
-- 今後はGoogleログインの認可コードをセッション交換するだけで、
-- provider_token/provider_refresh_tokenを別途保存・利用しない
-- （app/auth/callback/route.ts参照）。

drop table if exists public.google_tokens;
