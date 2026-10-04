import { describe, expect, it } from "vitest";

import { parseAnalyticsState, serializeAnalyticsState } from "@/lib/analytics/url-state";

const data = {
  members: [{ userId: "user-a", displayName: "A", color: null }],
  months: ["2026-08", "2026-09", "2026-10"],
  categories: [{ id: 1, name: "食費", costType: "variable" as const }],
  breakdowns: [{ id: 11, categoryId: 1, name: "外食" }],
  counterparts: [{ id: 21, name: "ふたり" }],
  payees: [
    { id: 41, name: "A病院", section: "shared" as const, sectionLabel: "グループ全体" },
    { id: 42, name: "スーパー", section: "own" as const, sectionLabel: "自分用" },
  ],
};

const fromQuery = (query: string) => {
  const params = new URLSearchParams(query);
  return parseAnalyticsState((key) => params.get(key), data);
};

const initial = {
  scopeUserId: null,
  includeJoint: false,
  month: "2026-10",
  chart: "pie",
  split: "category",
  filter: null,
  trendMonth: null,
};

describe("url-state", () => {
  it("U-88: URLに保存した状態を読み直し、書き出すと同じURLになる", () => {
    const query =
      "scope=user-a&joint=1&month=2026-09&chart=trend&split=breakdown&filter=category&filterValue=1&trendMonth=2026-08";
    const state = fromQuery(query);
    expect(state).toEqual({
      scopeUserId: "user-a",
      includeJoint: true,
      month: "2026-09",
      chart: "trend",
      split: "breakdown",
      filter: { dimension: "category", key: "1" },
      trendMonth: "2026-08",
    });
    expect(serializeAnalyticsState(state).toString()).toBe(query);
  });

  it("U-88: 不正な値・パラメータなしは初期値（全体・共同オフ・当月・円グラフ・カテゴリで分ける・絞り込みなし・月未選択）になる", () => {
    expect(fromQuery("")).toEqual(initial);
    expect(
      fromQuery(
        "scope=xxx&joint=1&month=2000-01&chart=xxx&split=xxx&filter=xxx&filterValue=1&trendMonth=1999-01"
      )
    ).toEqual(initial);
  });

  it("U-118: 絞り込みの値は選択肢にあるものだけを読む（内訳なし・支払い先・登録外・費用区分）", () => {
    expect(fromQuery("filter=breakdown&filterValue=none").filter).toEqual({
      dimension: "breakdown",
      key: "none",
    });
    expect(fromQuery("filter=payee&filterValue=41").filter).toEqual({
      dimension: "payee",
      key: "41",
    });
    expect(fromQuery("filter=payee&filterValue=unregistered").filter).toEqual({
      dimension: "payee",
      key: "unregistered",
    });
    expect(fromQuery("filter=costType&filterValue=fixed").filter).toEqual({
      dimension: "costType",
      key: "fixed",
    });
    // 存在しない値・値なし・「なし」は絞り込みなし
    expect(fromQuery("filter=payee&filterValue=999").filter).toBeNull();
    // F5 より前の URL（支払い先名）は、選択肢にないため絞り込みなし
    expect(fromQuery("filter=payee&filterValue=A%E7%97%85%E9%99%A2").filter).toBeNull();
    expect(fromQuery("filter=counterpart").filter).toBeNull();
    expect(fromQuery("filter=none&filterValue=1").filter).toBeNull();
    // 絞り込みなしで書き出すと filter=none になる
    expect(serializeAnalyticsState(fromQuery("")).get("filter")).toBe("none");
  });

  it("U-118: F4 より前のURL（推移グラフのカテゴリ category=ID）はカテゴリの絞り込みとして読む", () => {
    expect(fromQuery("chart=trend&category=1").filter).toEqual({ dimension: "category", key: "1" });
    expect(fromQuery("chart=trend&category=total").filter).toBeNull();
    // 新しい形式（filter）があるときは category は使わない
    expect(fromQuery("filter=none&category=1").filter).toBeNull();
  });
});
