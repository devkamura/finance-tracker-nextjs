import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPrevPath,
  recordPrevPath,
  replaceUrlKeepingAppState,
  shouldGoBack,
} from "@/lib/navigation/history-state";

// テストはNode環境のため、window.history を最小限に再現する。
// Next.jsの差し替え後の replaceState と同じく、渡された data に Next.js の項目（__NA）を足して保存する。
function installFakeHistory(initialState: Record<string, unknown> | null) {
  const history = {
    state: initialState as Record<string, unknown> | null,
    replaceState: vi.fn((data: Record<string, unknown> | null) => {
      history.state = { ...(data ?? {}), __NA: true };
    }),
  };
  vi.stubGlobal("window", { history });
  return history;
}

describe("shouldGoBack", () => {
  it("U-91: 直前にいた画面のパスが戻り先のパスと同じときだけ1つ前に戻る（クエリの違いは見ない）", () => {
    expect(shouldGoBack("/receipts", "/receipts?month=2026-07&open=D-2")).toBe(true);
    expect(shouldGoBack("/analytics", "/analytics?scope=all&month=2026-07")).toBe(true);
    expect(shouldGoBack("/receipts/D-2/edit", "/receipts?month=2026-07")).toBe(false);
    expect(shouldGoBack("/receipts/D-2", "/receipts/D-3")).toBe(false);
    // 記録がない（URLを直接開いた・記録が消えた）ときはリンクとして開く
    expect(shouldGoBack(null, "/receipts")).toBe(false);
  });
});

describe("history-state", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("U-91: 直前の画面のパスを記録して読み出せる。記録がなければnull", () => {
    installFakeHistory({ __NA: true });
    expect(getPrevPath()).toBeNull();
    recordPrevPath("/receipts");
    expect(getPrevPath()).toBe("/receipts");
  });

  it("U-91: URLを書き換えても直前の画面の記録は残り、Next.jsの項目は渡さない", () => {
    const history = installFakeHistory({ __NA: true, __appPrevPath: "/analytics" });
    replaceUrlKeepingAppState("/receipts?month=2026-07&open=D-2");

    expect(history.replaceState).toHaveBeenCalledWith(
      { __appPrevPath: "/analytics" },
      "",
      "/receipts?month=2026-07&open=D-2"
    );
    expect(getPrevPath()).toBe("/analytics");
  });
});
