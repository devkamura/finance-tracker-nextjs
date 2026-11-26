// 単体テスト：投資を見分ける（Issue #49）。
// 内訳ごとの費用区分、「投資を含める」（投資のカテゴリを除く条件）、一覧への引き継ぎ。

import { describe, expect, it } from "vitest";

import { sumByDimension, sumByMonth } from "@/lib/analytics/aggregate";
import {
  conditionsLabel,
  costTypeMap,
  costTypeOf,
  dimensionKey,
  investmentCategoryId,
  matchesConditions,
} from "@/lib/analytics/dimensions";
import { matchReceipt } from "@/lib/analytics/drilldown";
import type { AnalyticsRow } from "@/lib/analytics/types";
import {
  analysisConditions,
  isInvestmentForced,
  parseAnalyticsState,
  serializeAnalyticsState,
} from "@/lib/analytics/url-state";
import {
  buildAnalyticsReturnHref,
  buildFilteredListHref,
  LIST_CONDITION_PARAM_KEYS,
  parseListFilter,
} from "@/lib/receipts/list-params";
import { buildReceiptListView } from "@/lib/receipts/list-view";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const FOOD = 1;
const INVESTMENT = 30;
const NISA = 301; // 投資 ＞ 積立（NISA）：固定費
const STOCK = 302; // 投資 ＞ 個別株：変動費
const EAT_OUT = 101; // 食費 ＞ 外食：カテゴリと同じ（変動費）
const USER_A = "user-a";

const master = {
  categories: [
    { id: FOOD, name: "食費", costType: "variable" as const },
    { id: INVESTMENT, name: "投資", costType: "fixed" as const },
  ],
  breakdowns: [
    { id: EAT_OUT, categoryId: FOOD, name: "外食", costType: null },
    { id: NISA, categoryId: INVESTMENT, name: "積立（NISA）", costType: "fixed" as const },
    { id: STOCK, categoryId: INVESTMENT, name: "個別株", costType: "variable" as const },
  ],
  counterparts: [{ id: 21, name: "ふたり" }],
  payees: [],
};
const costTypes = costTypeMap(master.categories, master.breakdowns);
const members = [{ userId: USER_A, displayName: "A", color: null }];
const all = { kind: "all" as const };
const investmentId = String(INVESTMENT);

const values = (categoryId: number, breakdownId: number | null) => ({
  categoryId,
  breakdownId,
  counterpartId: 21,
  payeeId: null,
  isSpecialExpense: false,
});

const row = (
  month: string,
  categoryId: number,
  breakdownId: number | null,
  amount: number
): AnalyticsRow => ({
  month,
  categoryId,
  breakdownId,
  counterpartId: 21,
  payeeId: null,
  ownerUserId: null,
  isSpecialExpense: false,
  amount,
});

// 10月：食費 30,000（外食 10,000＋内訳なし 20,000）、NISA 20,000、個別株 5,000
// 11月：食費 25,000（内訳なし）、NISA 20,000
const rows: AnalyticsRow[] = [
  row("2026-10", FOOD, EAT_OUT, 10000),
  row("2026-10", FOOD, null, 20000),
  row("2026-10", INVESTMENT, NISA, 20000),
  row("2026-10", INVESTMENT, STOCK, 5000),
  row("2026-11", FOOD, null, 25000),
  row("2026-11", INVESTMENT, NISA, 20000),
];
const months = ["2026-10", "2026-11"];

describe("dimensions（内訳ごとの費用区分）", () => {
  it("U-169: 内訳の費用区分 → カテゴリの費用区分 → 変動費 の順に決まる", () => {
    expect(costTypeOf(values(INVESTMENT, NISA), costTypes)).toBe("fixed");
    expect(costTypeOf(values(INVESTMENT, STOCK), costTypes)).toBe("variable");
    // 内訳なし・「カテゴリと同じ」（null）の内訳は、カテゴリの費用区分
    expect(costTypeOf(values(INVESTMENT, null), costTypes)).toBe("fixed");
    expect(costTypeOf(values(FOOD, EAT_OUT), costTypes)).toBe("variable");
    // 設定が分からないカテゴリは変動費
    expect(costTypeOf(values(999, null), costTypes)).toBe("variable");
    // 「分ける」「絞り込み」の費用区分も同じ決め方
    expect(dimensionKey(values(INVESTMENT, STOCK), "costType", costTypes)).toBe("variable");
    expect(matchesConditions(values(INVESTMENT, STOCK), { costType: "fixed" }, costTypes)).toBe(false);
    expect(matchesConditions(values(INVESTMENT, NISA), { costType: "fixed" }, costTypes)).toBe(true);
  });

  it("U-170: 費用区分で分けると、内訳の費用区分で集計される", () => {
    const sums = sumByDimension(rows, all, "2026-10", "costType", {}, costTypes);
    expect(sums).toEqual([
      { key: "variable", amount: 35000 }, // 食費 30,000＋個別株 5,000
      { key: "fixed", amount: 20000 }, // NISA
    ]);
  });
});

describe("投資を除く条件", () => {
  it("U-171: カテゴリ「投資」の ID を名前で見分ける。なければ null", () => {
    expect(investmentCategoryId(master.categories)).toBe(investmentId);
    expect(investmentCategoryId([{ id: FOOD, name: "食費" }])).toBeNull();
  });

  it("U-172: 除くカテゴリの明細は当てはまらない。表示名は「投資を除く」", () => {
    const exclude = { excludeCategory: investmentId };
    expect(matchesConditions(values(INVESTMENT, NISA), exclude, costTypes)).toBe(false);
    expect(matchesConditions(values(FOOD, null), exclude, costTypes)).toBe(true);
    expect(conditionsLabel(exclude, master)).toBe("投資を除く");
    expect(
      conditionsLabel({ costType: "variable", specialExpense: "normal", excludeCategory: investmentId }, master)
    ).toBe("変動費・特別費を除く・投資を除く");
  });

  it("U-173: 投資を除くと、円グラフ・推移グラフから投資が消える。含めると戻る", () => {
    const excluded = analysisConditions(null, "category", true, investmentId);
    const included = analysisConditions(null, "category", true, null);
    expect(sumByDimension(rows, all, "2026-10", "category", excluded, costTypes)).toEqual([
      { key: String(FOOD), amount: 30000 },
    ]);
    expect(sumByDimension(rows, all, "2026-10", "category", included, costTypes)).toEqual([
      { key: String(FOOD), amount: 30000 },
      { key: investmentId, amount: 25000 },
    ]);
    expect(sumByMonth(rows, all, months, excluded, costTypes)).toEqual([
      { month: "2026-10", amount: 30000 },
      { month: "2026-11", amount: 25000 },
    ]);
    expect(sumByMonth(rows, all, months, included, costTypes)).toEqual([
      { month: "2026-10", amount: 55000 },
      { month: "2026-11", amount: 45000 },
    ]);
  });

  it("U-174: 特別費の条件と一緒に使える。除くカテゴリを渡さなければ今までと同じ", () => {
    expect(analysisConditions(null, null, false, investmentId)).toEqual({
      specialExpense: "normal",
      excludeCategory: investmentId,
    });
    expect(analysisConditions(null, null, false)).toEqual({ specialExpense: "normal" });
    expect(analysisConditions(null, null, true)).toEqual({});
  });

  it("U-175: 絞り込みで投資のカテゴリ・内訳を選んでいる間は、投資を含めるとみなす", () => {
    const breakdowns = master.breakdowns;
    expect(isInvestmentForced({ dimension: "category", key: investmentId }, investmentId, breakdowns)).toBe(true);
    expect(isInvestmentForced({ dimension: "breakdown", key: String(NISA) }, investmentId, breakdowns)).toBe(true);
    expect(isInvestmentForced({ dimension: "category", key: String(FOOD) }, investmentId, breakdowns)).toBe(false);
    expect(isInvestmentForced({ dimension: "breakdown", key: String(EAT_OUT) }, investmentId, breakdowns)).toBe(false);
    expect(isInvestmentForced({ dimension: "costType", key: "fixed" }, investmentId, breakdowns)).toBe(false);
    expect(isInvestmentForced(null, investmentId, breakdowns)).toBe(false);
    // カテゴリ「投資」がない環境では強制しない
    expect(isInvestmentForced({ dimension: "category", key: investmentId }, null, breakdowns)).toBe(false);
  });
});

describe("url-state（投資を含める）", () => {
  const data = { ...master, members, months };
  const fromQuery = (query: string) => {
    const params = new URLSearchParams(query);
    return parseAnalyticsState((key) => params.get(key), data);
  };

  it("U-176: 初期値は OFF。investment=1 のときだけ ON になり、URL に残る", () => {
    expect(fromQuery("").includeInvestment).toBe(false);
    expect(fromQuery("investment=yes").includeInvestment).toBe(false);
    const state = fromQuery("investment=1");
    expect(state.includeInvestment).toBe(true);
    expect(serializeAnalyticsState(state).get("investment")).toBe("1");
    expect(serializeAnalyticsState(fromQuery("")).has("investment")).toBe(false);
  });
});

describe("一覧への引き継ぎ（投資）", () => {
  const item = (
    id: string,
    price: number,
    categoryId: number,
    breakdownId: number | null
  ): ReceiptDetailItemView => ({
    id,
    itemName: id,
    price,
    taxType: "inclusive",
    taxRateName: null,
    taxRateMultiplier: null,
    categoryId,
    categoryName: categoryId === FOOD ? "食費" : "投資",
    breakdownId,
    breakdownName: null,
    counterpartId: 21,
    counterpartName: "ふたり",
    ownerUserId: null,
    ownerDisplayName: "共同",
    ownerColor: null,
    tagNames: [],
    isSpecialExpense: false,
  });
  const receipt = (id: string, items: ReceiptDetailItemView[]): ReceiptListItem => ({
    id,
    occurredAt: "2026-10-10T03:00:00.000Z",
    payeeId: null,
    payeeName: id,
    amount: items.reduce((sum, i) => sum + i.price, 0),
    transactionTypeName: "支出",
    payerUserId: USER_A,
    payerDisplayName: "A",
    payerColor: null,
    receiptImageUrl: null,
    isDuplicated: false,
    createdByDisplayName: "A",
    items,
  });

  it("U-177: 投資を除く条件が URL で引き継がれ、一覧の「うち」金額がグラフと一致する", () => {
    const conditions = analysisConditions(null, null, true, investmentId);
    const href = buildFilteredListHref({
      month: "2026-10",
      conditions,
      scope: all,
      from: "analytics",
      returnState: new URLSearchParams("scope=all&month=2026-10&chart=trend"),
    });
    const params = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(params.excludeCategory).toBe(investmentId);
    const filter = parseListFilter(params, master, members);
    expect(filter?.conditions).toEqual({ excludeCategory: investmentId });
    expect(filter?.label).toBe("投資を除く");

    const receipts = [
      receipt("r1", [item("food", 30000, FOOD, null)]),
      receipt("r2", [item("nisa", 20000, INVESTMENT, NISA)]),
      receipt("r3", [item("stock", 5000, INVESTMENT, STOCK)]),
    ];
    const view = buildReceiptListView(receipts, filter, "asc", costTypes, null);
    expect(view.items.map((i) => i.receipt.id)).toEqual(["r1"]);
    // 一覧には出さないが、「うち」金額の合計は、グラフの10月（投資を除いた食費 30,000）と一致する
    expect(view.matchedTotal).toBe(30000);
    expect(view.matchedTotal).toBe(sumByMonth(rows, all, months, conditions, costTypes)[0].amount);
    expect(matchReceipt(receipts[1], { conditions, scope: all }, costTypes).matchedAmount).toBe(0);
  });

  it("U-178: 存在しないカテゴリは無視する。「← 分析に戻る」に investment=1 が残る", () => {
    expect(
      parseListFilter({ excludeCategory: "999", scope: "all" }, master, members)?.conditions
    ).toEqual({});
    const href = buildFilteredListHref({
      month: "2026-10",
      conditions: {},
      scope: all,
      from: "analytics",
      returnState: new URLSearchParams("scope=all&month=2026-10&investment=1"),
    });
    const params = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(params.excludeCategory).toBeUndefined();
    expect(buildAnalyticsReturnHref(params.ret)).toContain("investment=1");
  });

  it("U-180: 一覧の画面と同じ手順（条件のパラメータだけを読む）でも、投資を除く条件が残る", () => {
    // 回帰テスト：一覧の画面（ReceiptListView）が別の一覧で条件を読んでいたため、
    // excludeCategory が捨てられ、一覧に投資のレシートが出ていた（受け入れテスト AT-10 で発見）
    expect(LIST_CONDITION_PARAM_KEYS).toContain("excludeCategory");
    const href = buildFilteredListHref({
      month: "2026-10",
      conditions: { ...analysisConditions(null, "category", false, investmentId), category: String(FOOD) },
      scope: all,
      from: "analytics",
    });
    const url = new URL(href, "http://localhost");
    const conditionParams: Record<string, string> = {};
    for (const key of LIST_CONDITION_PARAM_KEYS) {
      const value = url.searchParams.get(key);
      if (value) conditionParams[key] = value;
    }
    const filter = parseListFilter(conditionParams, master, members);
    expect(filter?.conditions.excludeCategory).toBe(investmentId);
    expect(filter?.label).toBe("食費・特別費を除く・投資を除く");
  });
});
