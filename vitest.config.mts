import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // "server-only"パッケージはreact-server条件下でのみno-op(empty.js)を解決する。
    // Vitestはこの条件を持たず、かつpackage.jsonのexportsがサブパスを制限しているため、
    // ファイルシステムパスで直接差し替える
    // （Server Actionsやサーバー専用ヘルパーをテストからimportできるようにするため）。
    alias: {
      "server-only": path.resolve(dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "**/*.integration.test.ts"],
  },
});
