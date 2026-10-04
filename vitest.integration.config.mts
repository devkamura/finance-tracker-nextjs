import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// RLSポリシー等、モックが困難な結合テスト用の設定。
// ローカルSupabaseスタック（`supabase start`）への実接続を前提とするため、
// 通常の単体テスト（`npm test`）とは別コマンド（`npm run test:integration`）で実行する。
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // サーバー専用モジュール（lib/analytics/queries.ts等）を結合テストからimportできるよう、
    // 単体テスト（vitest.config.mts）と同じく"server-only"をno-opに差し替える。
    alias: {
      "server-only": path.resolve(dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./vitest.integration.setup.mts"],
    testTimeout: 30000,
    fileParallelism: false,
    // 本番サーバー（instrumentation.tsでTZ=Asia/Tokyoに固定）と同じタイムゾーンで月を判定する
    env: { TZ: "Asia/Tokyo" },
  },
});
