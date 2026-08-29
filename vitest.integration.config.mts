import { defineConfig } from "vitest/config";

// RLSポリシー等、モックが困難な結合テスト用の設定。
// ローカルSupabaseスタック（`supabase start`）への実接続を前提とするため、
// 通常の単体テスト（`npm test`）とは別コマンド（`npm run test:integration`）で実行する。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./vitest.integration.setup.mts"],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
