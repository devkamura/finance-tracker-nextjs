// 単体テスト：特別費フラグの分析側（Issue #41。docs/test-spec.md U-151〜U-157）。

import { describe, expect, it } from "vitest";

import { paletteColor } from "@/lib/analytics/category-colors";
import {
  specialExpenseTotal,
  sumByDimension,
  sumByMonth,
  sumOverMonths,
} from "@/lib/analytics/aggregate";
import {
  conditionsLabel,
  costTypeMap,
  dimensionKey,
  dimensionOptions,
  keyColor,
  keyLabel,
  matchesConditions,
} from "@/lib/analytics/dimensions";
import { matchReceipt } from "@/lib/analytics/drilldown";
import { buildAnalyticsRows } from "@/lib/analytics/queries";
import type { AnalyticsRow } from "@/lib/analytics/types";
import {
  analysisConditions,
  isSpecialExpenseForced,
  parseAnalyticsState,
  serializeAnalyticsState,
} from "@/lib/analytics/url-state";
import {
  buildAnalyticsReturnHref,
  buildFilteredListHref,
  parseListFilter,
} from "@/lib/receipts/list-params";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const FOOD = 1;
const TRAVEL = 2;
const USER_A = "user-a";

const master = {
  categories: [
    { id: FOOD, name: "食費", costType: "variable" as const },
    { id: TRAVEL, name: "旅行", costType: "variable" as const },
  ],
  breakdowns: [],
  counterparts: [{ id: 21, name: "ふたり" }],
  payees: [],
};
const costTypes = costTypeMap(master.categories);
const members = [{ userId: USER_A, displayName: "A", color: null }];

const values = (isSpecialExpense: boolean) => ({
  categoryId: FOOD,
  breakdownId: null,
  counterpartId: 21,
  payeeId: null,
  isSpecialExpense,
});

describe("dimensions（特別費）", () => {
  it("U-151: 特別費の項目の値・表示名・選択肢・色", () => {
    expect(dimensionKey(values(true), "specialExpense", costTypes)).toBe("special");
    expect(dimensionKey(values(false), "specialExpense", costTypes)).toBe("normal");
    expect(keyLabel("specialExpense", "special", master)).toBe("特別費");
    expect(keyLabel("specialExpense", "normal", master)).toBe("通常");
    expect(keyLabel("specialExpense", "xxx", master)).toBe("不明");
    expect(dimensionOptions("specialExpense", master)).toEqual([
      { key: "normal", label: "通常" },
      { key: "special", label: "特別費" },
    ]);
    expect(keyColor("specialExpense", "normal", master)).toBe(paletteColor(0));
    expect(keyColor("specialExpense", "special", master)).toBe(paletteColor(1));
    expect(keyColor("specialExpense", "normal", master)).not.toBe(
      keyColor("specialExpense", "special", master)
    );
  });

  it("U-152: 特別費の条件での判定と表示名", () => {
    expect(matchesConditions(values(false), { specialExpense: "normal" }, costTypes)).toBe(true);
    expect(matchesConditions(values(true), { specialExpense: "normal" }, costTypes)).toBe(false);
    expect(matchesConditions(values(true), { specialExpense: "special" }, costTypes)).toBe(true);
    expect(matchesConditions(values(false), { specialExpense: "special" }, costTypes)).toBe(false);
    expect(conditionsLabel({ specialExpense: "normal" }, master)).toBe("特別費を除く");
    expect(conditionsLabel({ specialExpense: "special" }, master)).toBe("特別費");
    expect(conditionsLabel({ category: String(FOOD), specialExpense: "normal" }, master)).toBe(
      "食費・特別費を除く"
    );
  });
});

describe("buildAnalyticsRows（特別費）", () => {
  const receipt = (details: { price: number; is_special_expense?: boolean | null }[]) => ({
    id: "r1",
    occurred_at: new Date(2026, 10, 10, 12).toISOString(),
    amount: details.reduce((sum, d) => sum + d.price, 0),
    payee_id: null,
    payer_user_id: USER_A,
    transaction_types: { name: "支出" },
    receipt_details: details.map((d) => ({
      price: d.price,
      tax_type: "inclusive" as const,
      category_id: FOOD,
      breakdown_id: null,
      counterpart_id: 21,
      owner_user_id: null,
      is_special_expense: d.is_special_expense,
      consumption_taxes: null,
    })),
  });

  it("U-153: 特別費と通常は別の行になり、合計は変わらない。null・未指定は通常", () => {
    const rows = buildAnalyticsRows([
      receipt([
        { price: 1000, is_special_expense: true },
        { price: 300, is_special_expense: false },
        { price: 200, is_special_expense: null },
        { price: 100 },
      ]),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.isSpecialExpense)?.amount).toBe(1000);
    expect(rows.find((r) => !r.isSpecialExpense)?.amount).toBe(600);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(1600);
  });
});

describe("url-state（特別費）", () => {
  const data = { ...master, members, months: ["2026-10", "2026-11"] };
  const fromQuery = (query: string) => {
    const params = new URLSearchParams(query);
    return parseAnalyticsState((key) => params.get(key), data);
  };

  it("U-154: 特別費を含めるかを URL から読み書きする", () => {
    expect(fromQuery("special=1").includeSpecialExpense).toBe(true);
    expect(fromQuery("").includeSpecialExpense).toBe(false);
    expect(fromQuery("special=yes").includeSpecialExpense).toBe(false);

    const state = fromQuery("scope=all&month=2026-11&chart=pie&split=category&filter=none&special=1");
    expect(serializeAnalyticsState(state).get("special")).toBe("1");
    expect(fromQuery(serializeAnalyticsState(state).toString())).toEqual(state);
    // 含めないときは URL に出さない（今までの URL と同じ）
    expect(serializeAnalyticsState(fromQuery("")).has("special")).toBe(false);
    // 絞り込みの項目として読める
    expect(fromQuery("filter=specialExpense&filterValue=special").filter).toEqual({
      dimension: "specialExpense",
      key: "special",
    });
    expect(fromQuery("filter=specialExpense&filterValue=xxx").filter).toBeNull();
  });

  it("U-155: 含める／除くと、特別費の項目を選んでいる間の強制 ON", () => {
    const specialFilter = { dimension: "specialExpense" as const, key: "special" };
    const foodFilter = { dimension: "category" as const, key: String(FOOD) };

    expect(analysisConditions(null, "category", false)).toEqual({ specialExpense: "normal" });
    expect(analysisConditions(foodFilter, "category", false)).toEqual({
      category: String(FOOD),
      specialExpense: "normal",
    });
    expect(analysisConditions(null, "category", true)).toEqual({});
    // 絞り込みで特別費を選んだら、normal を足さない（0円にならない）
    expect(analysisConditions(specialFilter, "category", false)).toEqual({ specialExpense: "special" });
    // 分けるで特別費を選んだら、通常・特別費の両方を集計する
    expect(analysisConditions(null, "specialExpense", false)).toEqual({});
    // 推移グラフ（split=null）は絞り込みだけで判定する
    expect(analysisConditions(null, null, false)).toEqual({ specialExpense: "normal" });

    expect(isSpecialExpenseForced(specialFilter, null)).toBe(true);
    expect(isSpecialExpenseForced(null, "specialExpense")).toBe(true);
    expect(isSpecialExpenseForced(foodFilter, "category")).toBe(false);
    expect(isSpecialExpenseForced(null, null)).toBe(false);
  });
});

describe("aggregate（特別費）", () => {
  const row = (
    month: string,
    categoryId: number,
    isSpecialExpense: boolean,
    amount: number
  ): AnalyticsRow => ({
    month,
    categoryId,
    breakdownId: null,
    counterpartId: 21,
    payeeId: null,
    ownerUserId: null,
    isSpecialExpense,
    amount,
  });
  const rows = [
    row("2026-11", FOOD, false, 3000),
    row("2026-11", FOOD, true, 2000),
    row("2026-11", TRAVEL, true, 50000),
    row("2026-10", FOOD, false, 4000),
  ];
  const all = { kind: "all" as const };

  it("U-156: 除くと特別費の分だけ減り、含めると今までと同じ。分けるで通常／特別費に分かれる", () => {
    const excluded = sumByDimension(
      rows, all, "2026-11", "category", analysisConditions(null, "category", false), costTypes
    );
    expect(excluded).toEqual([{ key: String(FOOD), amount: 3000 }]);

    const included = sumByDimension(
      rows, all, "2026-11", "category", analysisConditions(null, "category", true), costTypes
    );
    expect(included).toEqual([
      { key: String(TRAVEL), amount: 50000 },
      { key: String(FOOD), amount: 5000 },
    ]);

    const split = sumByDimension(
      rows, all, "2026-11", "specialExpense", analysisConditions(null, "specialExpense", false), costTypes
    );
    expect(split).toEqual([
      { key: "special", amount: 52000 },
      { key: "normal", amount: 3000 },
    ]);

    const months = ["2026-10", "2026-11"];
    expect(sumByMonth(rows, all, months, analysisConditions(null, null, false), costTypes)).toEqual([
      { month: "2026-10", amount: 4000 },
      { month: "2026-11", amount: 3000 },
    ]);
    const specialOnly = analysisConditions({ dimension: "specialExpense", key: "special" }, null, false);
    expect(sumByMonth(rows, all, months, specialOnly, costTypes)).toEqual([
      { month: "2026-10", amount: 0 },
      { month: "2026-11", amount: 52000 },
    ]);
  });
});

describe("一覧への引き継ぎ（特別費）", () => {
  const item = (id: string, price: number, isSpecialExpense: boolean): ReceiptDetailItemView => ({
    id,
    itemName: id,
    price,
    taxType: "inclusive",
    taxRateName: null,
    taxRateMultiplier: null,
    categoryId: FOOD,
    categoryName: "食費",
    breakdownId: null,
    breakdownName: null,
    counterpartId: 21,
    counterpartName: "ふたり",
    ownerUserId: null,
    ownerDisplayName: "共同",
    ownerColor: null,
    tagNames: [],
    isSpecialExpense,
  });
  const receipt: ReceiptListItem = {
    id: "r1",
    occurredAt: "2026-11-10T03:00:00.000Z",
    payeeId: null,
    payeeName: "道の駅",
    amount: 1800, // 明細合計 2,000 を1割引で按分（通常 900・特別費 900）
    transactionTypeName: "支出",
    payerUserId: USER_A,
    payerDisplayName: "A",
    payerColor: null,
    receiptImageUrl: null,
    isDuplicated: false,
    createdByDisplayName: "A",
    items: [item("normal", 1000, false), item("special", 1000, true)],
  };

  it("U-157: 通常の明細だけが当てはまり、URL の条件・戻り先も引き継がれる", () => {
    const all = { kind: "all" as const };
    expect(matchReceipt(receipt, { conditions: { specialExpense: "normal" }, scope: all }, costTypes)).toEqual({
      matchedItemIds: ["normal"],
      matchedAmount: 900,
    });
    expect(matchReceipt(receipt, { conditions: { specialExpense: "special" }, scope: all }, costTypes)).toEqual({
      matchedItemIds: ["special"],
      matchedAmount: 900,
    });

    const href = buildFilteredListHref({
      month: "2026-11",
      conditions: { specialExpense: "normal" },
      scope: all,
      from: "analytics",
      returnState: new URLSearchParams("scope=all&month=2026-11&special=1"),
    });
    const params = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(params.specialExpense).toBe("normal");
    const filter = parseListFilter(params, master, members);
    expect(filter?.conditions).toEqual({ specialExpense: "normal" });
    expect(filter?.label).toBe("特別費を除く");
    // 不正な値は無視する
    expect(parseListFilter({ specialExpense: "xxx", scope: "all" }, master, members)?.conditions).toEqual({});
    // 「← 分析に戻る」に special=1 が残る
    expect(buildAnalyticsReturnHref(params.ret)).toContain("special=1");
  });
});

describe("直近12ヶ月の特別費（要件9）", () => {
  const row = (
    month: string,
    ownerUserId: string | null,
    isSpecialExpense: boolean,
    amount: number
  ): AnalyticsRow => ({
    month,
    categoryId: TRAVEL,
    breakdownId: null,
    counterpartId: 21,
    payeeId: null,
    ownerUserId,
    isSpecialExpense,
    amount,
  });
  const months = ["2026-09", "2026-10", "2026-11"];
  const rows = [
    row("2026-09", null, true, 30000), // 共同の宿泊費
    row("2026-10", USER_A, true, 2000), // A のお土産
    row("2026-11", null, true, -4000), // 共同の返金
    row("2026-11", null, false, 9000), // 通常（含めない）
    row("2026-08", null, true, 99999), // 対象の月より前（含めない）
  ];

  it("U-160: 対象の月の特別費だけを、表示対象の重みと返金を含めて合計する", () => {
    expect(specialExpenseTotal(rows, { kind: "all" }, months, costTypes)).toBe(28000);
    // A＋共同1/2：15,000＋2,000−2,000
    expect(
      specialExpenseTotal(rows, { kind: "user", userId: USER_A, includeJoint: true }, months, costTypes)
    ).toBe(15000);
    // A（共同なし）：お土産だけ
    expect(
      specialExpenseTotal(rows, { kind: "user", userId: USER_A, includeJoint: false }, months, costTypes)
    ).toBe(2000);
    // 特別費がなければ0（画面では行を出さない）
    expect(specialExpenseTotal([row("2026-11", null, false, 9000)], { kind: "all" }, months, costTypes)).toBe(0);
    // 推移グラフの各月の合計を足したものと一致する
    expect(sumOverMonths(rows, { kind: "all" }, months, { specialExpense: "special" }, costTypes)).toBe(
      sumByMonth(rows, { kind: "all" }, months, { specialExpense: "special" }, costTypes).reduce(
        (sum, m) => sum + m.amount,
        0
      )
    );
  });
});
