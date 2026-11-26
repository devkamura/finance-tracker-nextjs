# finance-tracker-nextjs

2人で使う家計簿アプリ（Next.js 版）。レシートと明細を記録し、支出の分析と2人の精算を行う。

- レシート・明細の登録（画像の読み取り（Gemini API）・一括入力・相方の分の複製登録）
- 支払い先・カテゴリの内訳・相手・タグの設定、支払い先の既定値
- 支出分析（円グラフ・推移グラフ、「分ける」「絞り込み」、特別費）
- 月ごとの精算（確定・再オープン）

## 技術スタック

- Next.js 16（App Router）/ React 19 / TypeScript / Tailwind CSS v4
- Supabase（PostgreSQL・Auth（Google ログイン）・Storage）
- Recharts、Font Awesome
- Vitest（単体・結合テスト）

## 文書

仕様は [docs/](docs/README.md) にある。

| 知りたいこと | 文書 |
|---|---|
| 何ができるアプリか | [docs/全体仕様書/要件定義書.md](docs/全体仕様書/要件定義書.md) |
| 画面・DB・権限・処理の設計 | [docs/全体仕様書/基本設計書.md](docs/全体仕様書/基本設計書.md) |
| 用語と、分析・精算の金額の計算方法 | [docs/全体仕様書/用語と算出方法.md](docs/全体仕様書/用語と算出方法.md) |
| 開発環境の起動・本番の設定・リリース手順 | [docs/全体仕様書/運用手順.md](docs/全体仕様書/運用手順.md) |
| Issue ごとの仕様 | [docs/仕様書/](docs/仕様書/) |

## 開発環境の起動

```bash
npm install
supabase start         # ローカルの Supabase（Docker）
cp .env.example .env    # 値は docs/全体仕様書/運用手順.md 2.2節
npm run dev             # http://localhost:3000
```

テスト：`npm test`（単体）、`npm run test:integration`（結合。ローカルの Supabase が必要）。
