import { describe, expect, it } from "vitest";

import { buildReceiptListView } from "@/lib/receipts/list-view";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const FOOD = 1;
const DAILY = 2;

function item(id: string, categoryId: number, price: number): ReceiptDetailItemView {
  return {
    id,
    itemName: id,
    price,
    taxType: "inclusive",
    taxRateName: null,
    taxRateMultiplier: null,
    categoryId,
    breakdownId: null,
    breakdownName: null,
    categoryName: categoryId === FOOD ? "食費" : "日用品",
    counterpartName: "ふたり",
    ownerUserId: null,
    ownerDisplayName: "共同",
    ownerColor: null,
    tagNames: [],
  };
}

function receipt(id: string, occurredAt: string, items: ReceiptDetailItemView[]): ReceiptListItem {
  return {
    id,
    occurredAt,
    payeeName: id,
    amount: items.reduce((sum, i) => sum + i.price, 0),
    transactionTypeName: "支出",
    payerUserId: "user-a",
    payerDisplayName: "A",
    payerColor: null,
    receiptImageUrl: null,
    isDuplicated: false,
    createdByDisplayName: "A",
    items,
  };
}

const receipts = [
  receipt("mid", "2026-07-15T03:00:00.000Z", [item("m1", DAILY, 500)]),
  receipt("old", "2026-07-05T03:00:00.000Z", [item("o1", FOOD, 1000)]),
  receipt("new", "2026-07-20T03:00:00.000Z", [item("n1", FOOD, 2000), item("n2", DAILY, 300)]),
];

describe("buildReceiptListView", () => {
  it("U-89: 絞り込みなしでは全件を並び順どおりに返す（新しい順／古い順）", () => {
    expect(buildReceiptListView(receipts, null, "desc").items.map((i) => i.receipt.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    const asc = buildReceiptListView(receipts, null, "asc");
    expect(asc.items.map((i) => i.receipt.id)).toEqual(["old", "mid", "new"]);
    expect(asc.items.every((i) => i.match === null)).toBe(true);
  });

  it("U-89: 絞り込み中は当てはまるレシートだけを並び順どおりに返し、「うち」の合計を出す", () => {
    const view = buildReceiptListView(
      receipts,
      { categoryId: FOOD, categoryName: "食費", scope: { kind: "all" }, scopeLabel: "全体" },
      "asc"
    );
    expect(view.items.map((i) => [i.receipt.id, i.match?.matchedAmount])).toEqual([
      ["old", 1000],
      ["new", 2000],
    ]);
    expect(view.matchedTotal).toBe(3000);
  });

  it("U-89: 元の配列は並べ替えない（画面側で解除・並び替えを繰り返しても元データが変わらない）", () => {
    const before = receipts.map((r) => r.id);
    buildReceiptListView(receipts, null, "asc");
    expect(receipts.map((r) => r.id)).toEqual(before);
  });
});
