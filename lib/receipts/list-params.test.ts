import { describe, expect, it } from "vitest";

import {
  buildAnalyticsReturnHref,
  buildFilteredListHref,
  parseDrilldownSource,
  parseListFilter,
  pickListParams,
  withQuery,
} from "@/lib/receipts/list-params";

const master = {
  categories: [
    { id: 1, name: "食費", costType: "variable" as const },
    { id: 2, name: "日用品", costType: "variable" as const },
  ],
  breakdowns: [{ id: 11, categoryId: 1, name: "外食" }],
  counterparts: [{ id: 22, name: "友人" }],
  payees: [{ id: 41, name: "A病院", section: "shared" as const, sectionLabel: "グループ全体" }],
};
const members = [
  { userId: "user-a", displayName: "A" },
  { userId: "user-b", displayName: "B" },
];

describe("list-params", () => {
  it("U-86: 絞り込み条件を読み取り、表示用の名前を作る", () => {
    expect(
      parseListFilter({ category: "1", scope: "user-a", joint: "1", from: "analytics" }, master, members)
    ).toEqual({
      conditions: { category: "1" },
      label: "食費",
      scope: { kind: "user", userId: "user-a", includeJoint: true },
      scopeLabel: "A＋共同1/2",
    });
    // 推移グラフの「総支出・全体」からの移動（scope=all だけ）も絞り込みとして扱う
    expect(parseListFilter({ scope: "all", from: "analytics" }, master, members)).toEqual({
      conditions: {},
      label: null,
      scope: { kind: "all" },
      scopeLabel: "全体",
    });
  });

  it("U-86: 不正なカテゴリ・グループ外のユーザーは無視し、条件がなければ絞り込まない", () => {
    expect(parseListFilter({ month: "2026-07", sort: "asc" }, master, members)).toBeNull();
    // 解除後（移動元だけが残っている状態）は絞り込みなし
    expect(parseListFilter({ month: "2026-07", from: "analytics" }, master, members)).toBeNull();
    expect(parseListFilter({ category: "999", scope: "outsider" }, master, members)).toBeNull();
    // 共同トグルはユーザー指定がないときは無視する
    expect(
      parseListFilter({ category: "2", scope: "outsider", joint: "1" }, master, members)
    ).toMatchObject({ conditions: { category: "2" }, scope: { kind: "all" }, scopeLabel: "全体" });
  });

  it("U-86: 引き継ぎ用のパラメータは一覧の状態だけを取り出し、openなどは含めない", () => {
    const params = pickListParams({
      month: "2026-07",
      sort: "asc",
      category: "1",
      scope: "user-a",
      joint: "1",
      from: "analytics",
      ret: "scope=user-a&month=2026-07",
      open: "receipt-1",
      other: "x",
    });
    expect(params.toString()).toBe(
      "month=2026-07&sort=asc&category=1&scope=user-a&joint=1&from=analytics&ret=scope%3Duser-a%26month%3D2026-07"
    );
    expect(withQuery("/receipts/r1", params)).toBe(`/receipts/r1?${params.toString()}`);
    expect(withQuery("/receipts", new URLSearchParams())).toBe("/receipts");
  });

  it("U-86: 分析画面から絞り込み一覧へのURLを作る（総支出ならcategoryなし）", () => {
    expect(
      buildFilteredListHref({
        month: "2026-07",
        conditions: { category: "1" },
        scope: { kind: "user", userId: "user-a", includeJoint: true },
        from: "analytics",
      })
    ).toBe("/receipts?month=2026-07&category=1&scope=user-a&joint=1&from=analytics");
    expect(
      buildFilteredListHref({ month: "2026-07", conditions: {}, scope: { kind: "all" }, from: "analytics" })
    ).toBe("/receipts?month=2026-07&scope=all&from=analytics");
  });

  it("U-86: 移動元（分析画面）は絞り込み条件とは別に読み取る", () => {
    expect(parseDrilldownSource({ from: "analytics" })).toBe("analytics");
    expect(parseDrilldownSource({ from: "xxx" })).toBeNull();
    expect(parseDrilldownSource({})).toBeNull();
  });

  it("U-90: 分析画面の状態（ret）を付けた一覧のURLを作り、そこから状態付きの分析画面のURLに戻せる", () => {
    const returnState = new URLSearchParams(
      "scope=user-a&joint=1&month=2026-07&chart=pie&split=breakdown&filter=category&filterValue=1"
    );
    const listHref = buildFilteredListHref({
      month: "2026-07",
      conditions: { category: "1", breakdown: "11" },
      scope: { kind: "user", userId: "user-a", includeJoint: true },
      from: "analytics",
      returnState,
    });
    const ret = new URL(listHref, "http://localhost").searchParams.get("ret");
    expect(buildAnalyticsReturnHref(ret)).toBe(`/analytics?${returnState.toString()}`);
    // ret がなければ初期状態の分析画面
    expect(buildAnalyticsReturnHref(null)).toBe("/analytics");
  });

  it("U-90: 戻り先は常に /analytics で、分析画面の状態以外の項目や外部URLは使わない（オープンリダイレクト対策）", () => {
    for (const ret of [
      "https://evil.example.com",
      "//evil.example.com",
      "/admin?month=2026-07",
      "next=https://evil.example.com&month=2026-07",
    ]) {
      const href = buildAnalyticsReturnHref(ret);
      expect(href.startsWith("/analytics")).toBe(true);
      expect(href).not.toContain("evil");
      expect(href).not.toContain("admin");
    }
    expect(buildAnalyticsReturnHref("next=https://evil.example.com&month=2026-07")).toBe(
      "/analytics?month=2026-07"
    );
  });

  it("U-119: 内訳・費用区分・支払い先・相手の条件を読み取り、表示名を作る", () => {
    const parse = (params: Record<string, string>) =>
      parseListFilter({ scope: "all", ...params }, master, members);

    expect(parse({ category: "1", breakdown: "11" })).toMatchObject({
      conditions: { category: "1", breakdown: "11" },
      label: "食費 ＞ 外食",
    });
    expect(parse({ category: "1", breakdown: "none" })?.label).toBe("食費 ＞ 内訳なし");
    expect(parse({ costType: "fixed", category: "2" })?.label).toBe("固定費・日用品");
    expect(parse({ category: "1", counterpart: "22" })?.label).toBe("食費・相手：友人");
    // 支払い先は登録済みの支払い先のIDか、登録外（手入力）で絞り込む
    expect(parse({ payee: "41" })).toMatchObject({
      conditions: { payee: "41" },
      label: "A病院",
    });
    expect(parse({ payee: "unregistered" })).toMatchObject({
      conditions: { payee: "unregistered" },
      label: "登録外（手入力）",
    });
    // 不正な内訳・費用区分・相手・支払い先（存在しないID、F5 より前の支払い先名・空）は無視する
    expect(
      parse({ breakdown: "999", costType: "xxx", counterpart: "999", payee: "999" })
    ).toMatchObject({
      conditions: {},
      label: null,
    });
    expect(parse({ payee: "A病院" })?.conditions).toEqual({});
    expect(parse({ payee: "" })?.conditions).toEqual({});
    // 条件だけ（scopeなし）でも絞り込み中とする
    expect(parseListFilter({ payee: "41" }, master, members)?.scope).toEqual({ kind: "all" });
  });

  it("U-119: 条件は一覧・詳細へ引き継ぎ、分析から一覧へのURLにすべての条件を付ける", () => {
    const params = pickListParams({
      month: "2026-07",
      breakdown: "none",
      costType: "fixed",
      payee: "",
      counterpart: "22",
      category: "",
    });
    // 空の値は引き継がない
    expect(params.toString()).toBe("month=2026-07&breakdown=none&costType=fixed&counterpart=22");
    expect(
      buildFilteredListHref({
        month: "2026-07",
        conditions: { counterpart: "22", payee: "unregistered", costType: "fixed" },
        scope: { kind: "all" },
        from: "analytics",
      })
    ).toBe(
      "/receipts?month=2026-07&costType=fixed&payee=unregistered&counterpart=22&scope=all&from=analytics"
    );
  });
});
