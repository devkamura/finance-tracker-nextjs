import { readFileSync } from "node:fs";
import path from "node:path";

import { config } from "@fortawesome/fontawesome-svg-core";
import { describe, expect, it } from "vitest";

import "@/lib/fontawesome";

// docs/bug-reports/2026-10-04-fontawesome-icon-flash.md の回帰テスト
describe("fontawesome", () => {
  it("U-125: アイコンの CSS を JavaScript で後から追加しない設定になり、ルートのレイアウトで読み込まれる", () => {
    expect(config.autoAddCss).toBe(false);
    // CSS を最初から読み込む設定は、ルートのレイアウトで読み込まないと効かない
    const layout = readFileSync(path.resolve(__dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toContain('import "@/lib/fontawesome";');
  });
});
