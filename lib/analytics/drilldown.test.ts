import { describe, expect, it } from "vitest";

import { sumByDimension } from "@/lib/analytics/aggregate";
import { costTypeMap, DIMENSIONS, dimensionKey, type Conditions } from "@/lib/analytics/dimensions";
import { matchReceipt, type DrilldownFilter } from "@/lib/analytics/drilldown";
import { buildAnalyticsRows } from "@/lib/analytics/queries";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const USER_A = "user-a";
const USER_B = "user-b";
const FOOD = 1;
const DAILY = 2;
const PAIR = 21; // ふたり
const FRIEND = 22; // 友人
const EATING_OUT = 11; // 食費 ＞ 外食

// 食費は変動費、日用品は固定費とする（費用区分での絞り込みの確認用）
const costTypes = costTypeMap([
  { id: FOOD, costType: "variable" },
  { id: DAILY, costType: "fixed" },
]);

function item(
  id: string,
  categoryId: number,
  ownerUserId: string | null,
  price: number,
  extra: { breakdownId?: number; counterpartId?: number } = {}
): ReceiptDetailItemView {
  return {
    id,
    itemName: id,
    price,
    taxType: "inclusive",
    taxRateName: null,
    taxRateMultiplier: null,
    categoryId,
    breakdownId: extra.breakdownId ?? null,
    breakdownName: null,
    categoryName: categoryId === FOOD ? "食費" : "日用品",
    counterpartId: extra.counterpartId ?? PAIR,
    counterpartName: "ふたり",
    ownerUserId,
    ownerDisplayName: ownerUserId ?? "共同",
    ownerColor: null,
    tagNames: [],
  };
}

function receipt(
  id: string,
  amount: number,
  items: ReceiptDetailItemView[],
  refund = false
): ReceiptListItem {
  return {
    id,
    occurredAt: "2026-07-10T03:00:00.000Z",
    payeeName: id,
    amount,
    transactionTypeName: refund ? "返金" : "支出",
    payerUserId: USER_A,
    payerDisplayName: "A",
    payerColor: null,
    receiptImageUrl: null,
    isDuplicated: false,
    createdByDisplayName: "A",
    items,
  };
}

// 手動テスト仕様書の2026年7月（D-1〜D-4）と同じ構成
const julyReceipts = [
  receipt("D-1", 1001, [item("d1-food", FOOD, null, 1001)]),
  receipt("D-2", 1500, [
    item("d2-food", FOOD, null, 1000, { breakdownId: EATING_OUT, counterpartId: FRIEND }),
    item("d2-daily", DAILY, USER_B, 1000),
  ]),
  receipt("D-3", 500, [item("d3-daily", DAILY, USER_A, 500)]),
  receipt("D-4", 2000, [item("d4-food", FOOD, USER_B, 2000)]),
];

describe("matchReceipt", () => {
  it("U-82: カテゴリを指定すると、そのカテゴリの明細だけが当てはまり、当てはまらないレシートは空になる", () => {
    const filter = { conditions: { category: String(DAILY) }, scope: { kind: "all" as const } };
    expect(matchReceipt(julyReceipts[1], filter, costTypes)).toEqual({
      matchedItemIds: ["d2-daily"],
      matchedAmount: 750,
    });
    expect(matchReceipt(julyReceipts[0], filter, costTypes)).toEqual({
      matchedItemIds: [],
      matchedAmount: 0,
    });
  });

  it("U-83: ユーザー（共同オフ）は帰属先が本人の明細だけ、共同オンでは共同の明細が1/2で加算される", () => {
    const off = { conditions: {}, scope: { kind: "user" as const, userId: USER_A, includeJoint: false } };
    const on = { conditions: {}, scope: { kind: "user" as const, userId: USER_A, includeJoint: true } };
    // D-2：共同の食費（按分後750円）とBの日用品（750円）
    expect(matchReceipt(julyReceipts[1], off, costTypes).matchedItemIds).toEqual([]);
    expect(matchReceipt(julyReceipts[1], on, costTypes)).toEqual({
      matchedItemIds: ["d2-food"],
      matchedAmount: 375,
    });
    // D-1：共同1,001円の1/2は500.5円（丸めない）
    expect(matchReceipt(julyReceipts[0], on, costTypes).matchedAmount).toBe(500.5);
  });

  it("U-84: 明細合計と支払額が違うレシートは按分後の金額になり、返金はマイナスになる", () => {
    const filter = { conditions: { category: String(FOOD) }, scope: { kind: "all" as const } };
    expect(matchReceipt(julyReceipts[1], filter, costTypes).matchedAmount).toBe(750);

    const refund = receipt("refund", 2000, [item("r-food", FOOD, null, 2000)], true);
    expect(matchReceipt(refund, filter, costTypes).matchedAmount).toBe(-2000);
  });

  it("U-114: 内訳・費用区分・支払い先・相手の条件と、条件の組み合わせ", () => {
    const all = { kind: "all" as const };
    const match = (conditions: Conditions) =>
      julyReceipts.flatMap((r) => matchReceipt(r, { conditions, scope: all }, costTypes).matchedItemIds);

    expect(match({ breakdown: String(EATING_OUT) })).toEqual(["d2-food"]);
    // 内訳なし（内訳を付けていない明細）
    expect(match({ category: String(FOOD), breakdown: "none" })).toEqual(["d1-food", "d4-food"]);
    // 費用区分はカテゴリの設定から求める（日用品＝固定費）
    expect(match({ costType: "fixed" })).toEqual(["d2-daily", "d3-daily"]);
    // 支払い先はレシートの支払い先名で、レシートのすべての明細が当てはまる
    expect(match({ payee: "D-2" })).toEqual(["d2-food", "d2-daily"]);
    expect(match({ counterpart: String(FRIEND) })).toEqual(["d2-food"]);
    // 絞り込み（カテゴリ＝食費）と円グラフの行（相手＝ふたり）の組み合わせ
    expect(match({ category: String(FOOD), counterpart: String(PAIR) })).toEqual([
      "d1-food",
      "d4-food",
    ]);
  });

  it("U-85: 絞り込みの合計は、分析の集計（buildAnalyticsRows＋sumByDimension）と一致する", () => {
    // 分析用の取得結果の形に変換して、同じレシート群を分析側でも集計する
    const raw = julyReceipts.map((r) => ({
      id: r.id,
      occurred_at: r.occurredAt,
      amount: r.amount,
      payee_name: r.payeeName,
      payer_user_id: r.payerUserId,
      transaction_types: { name: r.transactionTypeName },
      receipt_details: r.items.map((i) => ({
        price: i.price,
        tax_type: i.taxType,
        category_id: i.categoryId,
        breakdown_id: i.breakdownId,
        counterpart_id: i.counterpartId,
        owner_user_id: i.ownerUserId,
        consumption_taxes: null,
      })),
    }));
    const rows = buildAnalyticsRows(raw);
    const month = rows[0].month;

    const scopes: DrilldownFilter["scope"][] = [
      { kind: "all" },
      { kind: "user", userId: USER_A, includeJoint: true },
      { kind: "user", userId: USER_B, includeJoint: false },
    ];
    // すべての「分ける」項目について、分析の各行と、その行の条件での一覧の合計を比べる（U-115）
    for (const scope of scopes) {
      for (const dimension of DIMENSIONS) {
        const keys = new Set(rows.map((r) => dimensionKey(r, dimension, costTypes)));
        for (const key of keys) {
          const drilldownTotal = julyReceipts
            .map((r) => matchReceipt(r, { conditions: { [dimension]: key }, scope }, costTypes))
            .reduce((sum, m) => sum + m.matchedAmount, 0);
          const analyticsTotal =
            sumByDimension(rows, scope, month, dimension, {}, costTypes).find((c) => c.key === key)
              ?.amount ?? 0;
          expect(drilldownTotal).toBe(analyticsTotal);
        }
      }
    }
  });
});
