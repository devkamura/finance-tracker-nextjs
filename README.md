# finance-tracker-nextjs

家計簿の記録アプリ（Next.js版）。レシート情報をフォーム入力し、JSONとしてGoogle Driveへアップロードします。

[finance-tracker-django](https://github.com/devkamura/finance-tracker-django) のNext.js再実装です。取引の一覧・編集・削除・ダッシュボード・グラフ、およびOCR機能は未実装です（Django版と同じ「記録専用」スコープ）。

## 技術スタック

- Next.js（App Router）/ TypeScript / Tailwind CSS v4
- FontAwesome（`@fortawesome/react-fontawesome`）
- Supabase Auth — Google OAuthでログイン
- Supabase（PostgreSQL、`@supabase/supabase-js` + `@supabase/ssr`）
- googleapis（Google Drive API）

## セットアップ

### 1. Google Cloud Console側の準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存プロジェクトを使用）
2. 「APIとサービス」→「認証情報」でOAuth 2.0クライアントIDを作成（アプリケーションの種類: ウェブアプリケーション）
3. 承認済みのリダイレクトURIに以下を追加
   - 開発: `http://127.0.0.1:55321/auth/v1/callback`（ローカルSupabaseのポートは `supabase status` で確認）
   - staging/prod: `{SupabaseプロジェクトのURL}/auth/v1/callback`
4. OAuth同意画面のスコープに `https://www.googleapis.com/auth/drive.file` を追加
5. 「Google Drive API」を有効化
6. アップロード先のGoogle Driveフォルダを作成し、フォルダIDを控える（フォルダURLの末尾の文字列）
7. 発行された クライアントID / クライアントシークレット を控える

公開ステータスが「テスト」の場合、テストユーザーとして利用するGoogleアカウントを追加してください（未追加のアカウントはログインできません）。また「テスト」ステータスのままだと `refresh_token` が7日で失効するため、継続利用する場合は本番公開への切り替えを検討してください。

### 2. ローカルSupabaseスタックの起動

```bash
npm install
supabase start
```

初回起動時に `supabase/migrations` のマイグレーションと `supabase/seed.sql` のマスタデータ投入が自動実行されます。起動後、`supabase status` で表示される `Project URL` / `Publishable key`（anon key相当）/ `Secret key`（service_role key相当）を控えてください。

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集し、以下を設定してください。

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（`supabase status` の値）
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GDRIVE_FOLDER_ID`

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` は `supabase/config.toml` の `[auth.external.google]` からも `env()` 参照されるため、`supabase start` 実行前に `.env` へ設定しておくと警告が出ません。

### 4. 開発サーバーの起動

Next.js自体はDockerを使わず、ローカルのNode.jsで直接起動します（DockerはローカルSupabaseスタックのみで使用）。

```bash
npm run dev
```

`http://localhost:3000` にアクセスしてください。

## ディレクトリ構成

```
app/                  # App Router（page.tsx, login/, auth/callback/）
components/           # UIコンポーネント（receipt-form/, ui/）
lib/                  # Supabaseクライアント、Google Drive連携、バリデーション、Server Action
supabase/             # マイグレーション・シード・ローカルスタック設定
types/                # 型定義
```

## Supabaseの型生成

`supabase/migrations` を変更した場合は型定義を再生成してください。

```bash
supabase gen types typescript --local > lib/supabase/database.types.ts
```

## 本番環境（Vercel）

本番はVercel（GitHubリポジトリを直接インポート）+ クラウドのSupabaseプロジェクトで運用します。Google Cloud Console・Supabase・Vercelそれぞれで必要な設定、各キー/IDの用途と取得方法、トラブルシューティングは [docs/deployment-guide.md](docs/deployment-guide.md) を参照してください。

## 手動確認チェックリスト

- [ ] Googleログイン → ログアウト
- [ ] 店舗「該当なし」選択時のテキスト入力表示
- [ ] レシート項目の追加・削除
- [ ] 項目が1件のときのみ「合計と同じ」ボタンが表示される
- [ ] 一括入力（税率・カテゴリー・目的の一括適用）
- [ ] 各種必須項目のバリデーションエラー表示
- [ ] 送信 → 確認モーダル → Google Driveへの実アップロード確認
