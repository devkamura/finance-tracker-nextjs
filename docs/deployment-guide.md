# デプロイ設定ガイド

このアプリを新しい環境(本番・別の開発者のPCなど)で動かすために必要な、Google Cloud Console / Supabase / Vercel の設定と、各キー・IDが何のために使われるかをまとめる。

## 全体像

```
ブラウザ
  │  ①「Googleでログイン」
  ▼
Next.js (Vercel)
  │  ② signInWithOAuth() でSupabaseの/authorizeへリダイレクト
  ▼
Supabase Auth (Supabaseプロジェクト)
  │  ③ Googleへリダイレクト（Supabase Auth自身のGoogleクライアント設定を使用）
  ▼
Google OAuth 同意画面
  │  ④ 許可後、Supabase Authのコールバックへ戻る
  ▼
Supabase Auth → Next.jsの /auth/callback へリダイレクト
  │  ⑤ セッション確立。Google側のaccess_token/refresh_tokenを
  │    google_tokensテーブルに保存（Google Drive API呼び出し用）
  ▼
以降、レシート送信時は googleapis (Node.js) が直接Google Drive APIを呼ぶ
```

ポイントは、**Googleとの認証フローに2つの経路がある**こと。

- **ログインそのもの**: Supabase Auth(サーバー)が主体になってGoogleと通信する。この設定は`supabase/config.toml`経由でSupabaseプロジェクトに登録する（Vercelの環境変数とは別物）。
- **Google Drive APIの呼び出し**: Next.jsアプリ(Vercel上で動くサーバーコード)が`googleapis`ライブラリで直接Googleと通信する。この設定はVercelの環境変数で渡す。

**同じGoogle Client ID/Secretの値を、この2箇所（Supabase側とVercel側）両方に登録する必要がある。** どちらか片方だけでは動かない。

---

## 1. Google Cloud Console

### 1-1. プロジェクトとOAuthクライアント

1プロジェクトの中に、**開発用・本番用で別々のOAuthクライアント**を作成する（推奨）。

理由: クライアントID/シークレットは環境ごとに独立させておくと、片方が漏洩・失効しても他方に影響しない。1つのクライアントに複数のリダイレクトURIを登録することも技術的には可能だが、認証情報自体を分けておく方が安全。

手順（開発用・本番用それぞれで実施）:

1. [Google Cloud Console](https://console.cloud.google.com/) →「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuthクライアントID」
2. アプリケーションの種類: **ウェブアプリケーション**
3. 承認済みのリダイレクトURIに、対応するSupabaseプロジェクトのコールバックURLを登録
   - ローカル開発: `http://127.0.0.1:55321/auth/v1/callback` (`supabase status`のPort、環境により変わる)
   - 本番: `https://<本番プロジェクトref>.supabase.co/auth/v1/callback`
4. 発行された **クライアントID** と **クライアントシークレット** を控える
   - → 開発用は`.env`の`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
   - → 本番用はVercelの環境変数、および後述の`supabase config push`用

### 1-2. OAuth同意画面（プロジェクト共通、1回だけ設定）

Google Cloud Consoleの左メニュー「APIとサービス」→「Google Auth platform」配下（UIが変わることがあるので「Audience」「Data Access」等のタブを探す）。

- **Data Access**タブでスコープに `https://www.googleapis.com/auth/drive.file` を追加
- 公開ステータスが「テスト」の場合、**Audience**タブの「Test users」に、実際にログインするGoogleアカウントを追加（未追加のアカウントはログイン時に拒否される）

### 1-3. Google Drive APIの有効化

「APIとサービス」→「ライブラリ」→「Google Drive API」を検索して有効化。

### 1-4. アップロード先フォルダ（`GDRIVE_FOLDER_ID`）

Google Driveでレシート保存用フォルダを作成し、フォルダを開いたときのURL末尾の文字列を控える。

```
https://drive.google.com/drive/folders/【この部分がGDRIVE_FOLDER_ID】
```

---

## 2. Supabase

### 2-1. ローカル開発 vs 本番プロジェクトの違い

- **ローカル**: `supabase start`でDocker上にPostgres/Auth等一式を起動する。設定は`supabase/config.toml`から読み込まれる。
- **本番**: [supabase.com](https://supabase.com/dashboard)で作成したクラウドプロジェクト。設定はCLIから`supabase db push`/`supabase config push`で反映する。

### 2-2. 各キー・IDの用途と取得場所

| 名称 | 用途 | 取得場所 |
|---|---|---|
| **Project URL** | アプリがSupabaseに接続する先のURL(`NEXT_PUBLIC_SUPABASE_URL`) | ブラウザでダッシュボードを開いている時のURL `https://supabase.com/dashboard/project/【ref】` の`【ref】`部分から `https://【ref】.supabase.co` |
| **Project ref** | `supabase link`でCLIとプロジェクトを紐付ける時に使うID | 上記URLの`【ref】`部分、または「Project Settings」の「Reference ID」 |
| **Publishable key**(旧: anon key) | ブラウザ・サーバーの両方からアプリが使う公開鍵。`NEXT_PUBLIC_SUPABASE_ANON_KEY` | 「Project Settings」→「API Keys」タブ |
| **Secret key**(旧: service_role key) | サーバー専用の管理者権限キー。RLSを無視して`google_tokens`テーブルを読み書きするために使用。`SUPABASE_SERVICE_ROLE_KEY` | 「Project Settings」→「API Keys」タブ。**絶対にブラウザに露出させない** |
| **Personal Access Token**(`sbp_...`) | Supabase CLI(`supabase link`/`db push`/`config push`)がアカウントを操作するための認証トークン。アプリの実行時には使わない | [アカウント設定 → Access Tokens](https://supabase.com/dashboard/account/tokens) |

### 2-3. マイグレーション・マスタデータの反映

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."   # Personal Access Token
supabase link --project-ref <本番プロジェクトref>
supabase db push --include-seed          # supabase/migrations/ と supabase/seed.sql を反映
```

### 2-4. Google認証設定の反映（Vercelの環境変数だけでは不十分）

`supabase/config.toml`の`[auth.external.google]`は、`supabase start`（ローカル）や`supabase config push`（本番）を実行した**その時点のシェル環境変数**から`env(GOOGLE_CLIENT_ID)`/`env(GOOGLE_CLIENT_SECRET)`を読み込む。Vercelに設定した値は自動的にはここへ届かない。

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
set -a
source .env.prod   # 本番用のGOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRETを含むファイル
set +a
supabase config push
```

`config.toml`の`additional_redirect_urls`に、本番のNext.jsアプリの`/auth/callback`URL(例: `https://finance-tracker-nextjs-two.vercel.app/auth/callback`)を追加してから実行すること。ここに登録されていないURLへはSupabase Authがリダイレクトを拒否する。

---

## 3. Vercel

### 3-1. デプロイ

1. [vercel.com](https://vercel.com/)にGitHubアカウントでログイン
2. 「Add New」→「Project」→対象リポジトリを選択して「Import」
3. Framework Presetは自動的に「Next.js」になる

### 3-2. 環境変数

「Project Settings」→「Environment Variables」で以下を設定。

| 変数名 | 値の取得元 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 上記 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 上記 Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 上記 Secret key |
| `NEXT_PUBLIC_SITE_URL` | Vercelのデプロイ先URL(初回デプロイ後に「Settings」→「Domains」で確認できる) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 本番用OAuthクライアント(1-1) |
| `GDRIVE_FOLDER_ID` | アップロード先フォルダID(1-4) |

環境変数を変更した場合、**自動では反映されない**。「Deployments」タブ→最新デプロイの「...」→「Redeploy」で再デプロイする。

---

## 4. 新しい環境を作る時のチェックリスト

1. Google Cloud Consoleで新しいOAuthクライアントを発行し、リダイレクトURIに`https://<プロジェクトref>.supabase.co/auth/v1/callback`を登録
2. Supabaseプロジェクトを作成
3. `supabase link` → `supabase db push --include-seed`
4. `supabase/config.toml`の`additional_redirect_urls`に環境のURLを追加
5. `supabase config push`(実行時のシェル環境変数にその環境用のGOOGLE_CLIENT_ID/SECRETをセットしておく)
6. デプロイ先(Vercel等)に環境変数一式を設定し、デプロイ

## トラブルシューティング

- **ログイン後に`/login?error=auth`に戻ってくる**: `supabase/config.toml`の`site_url`/`additional_redirect_urls`と、アプリの`NEXT_PUBLIC_SITE_URL`が一致していない可能性が高い。特に`localhost`と`127.0.0.1`は別ホスト扱いされ、Cookieも共有されないため注意。
- **ログイン後に再度ログイン画面に戻る(エラーは出ない)**: `NEXT_PUBLIC_SITE_URL`が空、または`/auth/callback`を経由せず`/`に直接`?code=...`付きで着地している。上記と同じ原因のことが多い。
- **Googleログイン時に「アクセスをブロックされました」と表示される**: OAuth同意画面が「テスト」ステータスで、ログインしようとしているアカウントがテストユーザーに追加されていない。
- **Vercelの環境変数を変えたのに反映されない**: Redeployが必要(環境変数の変更だけでは既存のデプロイには反映されない)。
