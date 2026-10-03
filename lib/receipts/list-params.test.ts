import { describe, expect, it } from "vitest";

import {
  buildFilteredListHref,
  parseDrilldownSource,
  parseListFilter,
  pickListParams,
  withQuery,
} from "@/lib/receipts/list-params";

const categories = [
  { id: 1, name: "食費" },
  { id: 2, name: "日用品" },
];
const members = [
  { userId: "user-a", displayName: "A" },
  { userId: "user-b", displayName: "B" },
];

describe("list-params", () => {
  it("U-86: 絞り込み条件を読み取り、表示用の名前を作る", () => {
    expect(
      parseListFilter({ category: "1", scope: "user-a", joint: "1", from: "analytics" }, categories, members)
    ).toEqual({
      categoryId: 1,
      categoryName: "食費",
      scope: { kind: "user", userId: "user-a", includeJoint: true },
      scopeLabel: "A＋共同1/2",
    });
    // 推移グラフの「総支出・全体」からの移動（scope=all だけ）も絞り込みとして扱う
    expect(parseListFilter({ scope: "all", from: "analytics" }, categories, members)).toEqual({
      categoryId: null,
      categoryName: null,
      scope: { kind: "all" },
      scopeLabel: "全体",
    });
  });

  it("U-86: 不正なカテゴリ・グループ外のユーザーは無視し、条件がなければ絞り込まない", () => {
    expect(parseListFilter({ month: "2026-07", sort: "asc" }, categories, members)).toBeNull();
    // 解除後（移動元だけが残っている状態）は絞り込みなし
    expect(parseListFilter({ month: "2026-07", from: "analytics" }, categories, members)).toBeNull();
    expect(parseListFilter({ category: "999", scope: "outsider" }, categories, members)).toBeNull();
    // 共同トグルはユーザー指定がないときは無視する
    expect(
      parseListFilter({ category: "2", scope: "outsider", joint: "1" }, categories, members)
    ).toMatchObject({ categoryId: 2, scope: { kind: "all" }, scopeLabel: "全体" });
  });

  it("U-86: 引き継ぎ用のパラメータは一覧の状態だけを取り出し、openなどは含めない", () => {
    const params = pickListParams({
      month: "2026-07",
      sort: "asc",
      category: "1",
      scope: "user-a",
      joint: "1",
      from: "analytics",
      open: "receipt-1",
      other: "x",
    });
    expect(params.toString()).toBe(
      "month=2026-07&sort=asc&category=1&scope=user-a&joint=1&from=analytics"
    );
    expect(withQuery("/receipts/r1", params)).toBe(`/receipts/r1?${params.toString()}`);
    expect(withQuery("/receipts", new URLSearchParams())).toBe("/receipts");
  });

  it("U-86: 分析画面から絞り込み一覧へのURLを作る（総支出ならcategoryなし）", () => {
    expect(
      buildFilteredListHref({
        month: "2026-07",
        categoryId: 1,
        scope: { kind: "user", userId: "user-a", includeJoint: true },
        from: "analytics",
      })
    ).toBe("/receipts?month=2026-07&category=1&scope=user-a&joint=1&from=analytics");
    expect(
      buildFilteredListHref({ month: "2026-07", categoryId: null, scope: { kind: "all" }, from: "analytics" })
    ).toBe("/receipts?month=2026-07&scope=all&from=analytics");
  });

  it("U-86: 移動元（分析画面）は絞り込み条件とは別に読み取る", () => {
    expect(parseDrilldownSource({ from: "analytics" })).toBe("analytics");
    expect(parseDrilldownSource({ from: "xxx" })).toBeNull();
    expect(parseDrilldownSource({})).toBeNull();
  });
});
