# finance-tracker-nextjs

家計簿の記録アプリ（Next.js版）。レシート情報をフォーム入力し、JSONとしてGoogle Driveへアップロードします。

[finance-tracker-django](https://github.com/devkamura/finance-tracker-django) のNext.js再実装です。取引の一覧・編集・削除・ダッシュボード・グラフ、およびOCR機能は未実装です（Django版と同じ「記録専用」スコープ）。

## 技術スタック

- Next.js（App Router）/ TypeScript / Tailwind CSS v4
- FontAwesome（`@fortawesome/react-fontawesome`）
- Auth.js (NextAuth v5) — Google OAuthでログイン
- Prisma（PostgreSQL、ドライバアダプタ `@prisma/adapter-pg`）
- googleapis（Google Drive API）

## セットアップ

### 1. Google Cloud Console側の準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存プロジェクトを使用）
2. 「APIとサービス」→「認証情報」でOAuth 2.0クライアントIDを作成（アプリケーションの種類: ウェブアプリケーション）
3. 承認済みのリダイレクトURIに以下を追加
   - 開発: `http://localhost:3000/api/auth/callback/google`
   - staging/prod: `{デプロイ先ドメイン}/api/auth/callback/google`
4. OAuth同意画面のスコープに `https://www.googleapis.com/auth/drive.file` を追加
5. 「Google Drive API」を有効化
6. アップロード先のGoogle Driveフォルダを作成し、フォルダIDを控える（フォルダURLの末尾の文字列）
7. 発行された クライアントID / クライアントシークレット を控える

公開ステータスが「テスト」の場合、テストユーザーとして利用するGoogleアカウントを追加してください（未追加のアカウントはログインできません）。また「テスト」ステータスのままだと `refresh_token` が7日で失効するため、継続利用する場合は本番公開への切り替えを検討してください。

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集し、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GDRIVE_FOLDER_ID` を設定してください。`AUTH_SECRET` は以下で生成できます。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. 開発環境の起動（Docker）

```bash
docker compose up
```

初回起動時にマイグレーションとマスタデータのシードが自動実行されます。`http://localhost:3000` にアクセスしてください。

### 3'. Dockerを使わない場合

```bash
npm install
docker compose up db -d   # PostgreSQLのみ起動
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## ディレクトリ構成

```
app/                  # App Router（page.tsx, login/, api/auth/）
components/           # UIコンポーネント（receipt-form/, ui/）
lib/                  # Prismaクライアント、Google Drive連携、バリデーション、Server Action
prisma/               # スキーマ・マイグレーション・シード
types/                # 型定義
```

## 本番/ステージング環境

```bash
docker compose -f docker-compose.staging.yml up -d --build
docker compose -f docker-compose.prod.yml up -d --build
```

それぞれ `.env.staging` / `.env.production` を用意してください（`.env.example` を参照）。`AUTH_URL` はデプロイ先ドメインに合わせて変更してください。

## 手動確認チェックリスト（テストコードは未実装のため）

- [ ] Googleログイン → ログアウト
- [ ] 店舗「該当なし」選択時のテキスト入力表示
- [ ] レシート項目の追加・削除
- [ ] 項目が1件のときのみ「合計と同じ」ボタンが表示される
- [ ] 一括入力（税率・カテゴリー・目的の一括適用）
- [ ] 各種必須項目のバリデーションエラー表示
- [ ] 送信 → 確認モーダル → Google Driveへの実アップロード確認
