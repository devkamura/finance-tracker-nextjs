import { describe, expect, it } from "vitest";

import { sumByCategory } from "@/lib/analytics/aggregate";
import { matchReceipt } from "@/lib/analytics/drilldown";
import { buildAnalyticsRows } from "@/lib/analytics/queries";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const USER_A = "user-a";
const USER_B = "user-b";
const FOOD = 1;
const DAILY = 2;

function item(
  id: string,
  categoryId: number,
  ownerUserId: string | null,
  price: number
): ReceiptDetailItemView {
  return {
    id,
    itemName: id,
    price,
    taxType: "inclusive",
    taxRateName: null,
    taxRateMultiplier: null,
    categoryId,
    categoryName: categoryId === FOOD ? "食費" : "日用品",
    purposeName: "生活維持",
    ownerUserId,
    ownerDisplayName: ownerUserId ?? "共同",
    ownerColor: null,
    sceneNames: [],
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
  receipt("D-2", 1500, [item("d2-food", FOOD, null, 1000), item("d2-daily", DAILY, USER_B, 1000)]),
  receipt("D-3", 500, [item("d3-daily", DAILY, USER_A, 500)]),
  receipt("D-4", 2000, [item("d4-food", FOOD, USER_B, 2000)]),
];

describe("matchReceipt", () => {
  it("U-82: カテゴリを指定すると、そのカテゴリの明細だけが当てはまり、当てはまらないレシートは空になる", () => {
    const filter = { categoryId: DAILY, scope: { kind: "all" as const } };
    expect(matchReceipt(julyReceipts[1], filter)).toEqual({
      matchedItemIds: ["d2-daily"],
      matchedAmount: 750,
    });
    expect(matchReceipt(julyReceipts[0], filter)).toEqual({
      matchedItemIds: [],
      matchedAmount: 0,
    });
  });

  it("U-83: ユーザー（共同オフ）は帰属先が本人の明細だけ、共同オンでは共同の明細が1/2で加算される", () => {
    const off = { categoryId: null, scope: { kind: "user" as const, userId: USER_A, includeJoint: false } };
    const on = { categoryId: null, scope: { kind: "user" as const, userId: USER_A, includeJoint: true } };
    // D-2：共同の食費（按分後750円）とBの日用品（750円）
    expect(matchReceipt(julyReceipts[1], off).matchedItemIds).toEqual([]);
    expect(matchReceipt(julyReceipts[1], on)).toEqual({
      matchedItemIds: ["d2-food"],
      matchedAmount: 375,
    });
    // D-1：共同1,001円の1/2は500.5円（丸めない）
    expect(matchReceipt(julyReceipts[0], on).matchedAmount).toBe(500.5);
  });

  it("U-84: 明細合計と支払額が違うレシートは按分後の金額になり、返金はマイナスになる", () => {
    const filter = { categoryId: FOOD, scope: { kind: "all" as const } };
    expect(matchReceipt(julyReceipts[1], filter).matchedAmount).toBe(750);

    const refund = receipt("refund", 2000, [item("r-food", FOOD, null, 2000)], true);
    expect(matchReceipt(refund, filter).matchedAmount).toBe(-2000);
  });

  it("U-85: 絞り込みの合計は、分析の集計（buildAnalyticsRows＋sumByCategory）と一致する", () => {
    // 分析用の取得結果の形に変換して、同じレシート群を分析側でも集計する
    const raw = julyReceipts.map((r) => ({
      id: r.id,
      occurred_at: r.occurredAt,
      amount: r.amount,
      payer_user_id: r.payerUserId,
      transaction_types: { name: r.transactionTypeName },
      receipt_details: r.items.map((i) => ({
        price: i.price,
        tax_type: i.taxType,
        category_id: i.categoryId,
        owner_user_id: i.ownerUserId,
        consumption_taxes: null,
      })),
    }));
    const rows = buildAnalyticsRows(raw);
    const month = rows[0].month;

    const scopes = [
      { kind: "all" as const },
      { kind: "user" as const, userId: USER_A, includeJoint: true },
      { kind: "user" as const, userId: USER_B, includeJoint: false },
    ];
    for (const scope of scopes) {
      for (const categoryId of [FOOD, DAILY]) {
        const drilldownTotal = julyReceipts
          .map((r) => matchReceipt(r, { categoryId, scope }).matchedAmount)
          .reduce((sum, v) => sum + v, 0);
        const analyticsTotal =
          sumByCategory(rows, scope, month).find((c) => c.categoryId === categoryId)?.amount ?? 0;
        expect(drilldownTotal).toBe(analyticsTotal);
      }
    }
  });
});
