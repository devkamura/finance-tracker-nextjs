import { describe, expect, it } from "vitest";

import { parseAnalyticsState, serializeAnalyticsState } from "@/lib/analytics/url-state";

const data = {
  members: [{ userId: "user-a", displayName: "A", color: null }],
  months: ["2026-08", "2026-09", "2026-10"],
  categories: [{ id: 1, name: "食費" }],
};

const fromQuery = (query: string) => {
  const params = new URLSearchParams(query);
  return parseAnalyticsState((key) => params.get(key), data);
};

describe("url-state", () => {
  it("U-88: URLに保存した状態を読み直し、書き出すと同じURLになる", () => {
    const query = "scope=user-a&joint=1&month=2026-09&chart=trend&category=1&trendMonth=2026-08";
    const state = fromQuery(query);
    expect(state).toEqual({
      scopeUserId: "user-a",
      includeJoint: true,
      month: "2026-09",
      chart: "trend",
      categoryId: 1,
      trendMonth: "2026-08",
    });
    expect(serializeAnalyticsState(state).toString()).toBe(query);
  });

  it("U-88: 不正な値・パラメータなしは初期値（全体・共同オフ・当月・円グラフ・総支出・月未選択）になる", () => {
    const expected = {
      scopeUserId: null,
      includeJoint: false,
      month: "2026-10",
      chart: "pie",
      categoryId: null,
      trendMonth: null,
    };
    expect(fromQuery("")).toEqual(expected);
    expect(
      fromQuery("scope=xxx&joint=1&month=2000-01&chart=xxx&category=999&trendMonth=1999-01")
    ).toEqual(expected);
  });
});
