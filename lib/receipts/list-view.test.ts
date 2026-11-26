import { describe, expect, it } from "vitest";

import { costTypeMap } from "@/lib/analytics/dimensions";
import { buildReceiptListView, describeListConditions } from "@/lib/receipts/list-view";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const FOOD = 1;
const DAILY = 2;
const costTypes = costTypeMap([
  { id: FOOD, costType: "variable" },
  { id: DAILY, costType: "variable" },
]);

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
    counterpartId: 21,
    counterpartName: "ふたり",
    ownerUserId: null,
    ownerDisplayName: "共同",
    ownerColor: null,
    tagNames: [],
    isSpecialExpense: false,
  };
}

function receipt(id: string, occurredAt: string, items: ReceiptDetailItemView[]): ReceiptListItem {
  return {
    id,
    occurredAt,
    payeeId: null,
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
    expect(buildReceiptListView(receipts, null, "desc", costTypes).items.map((i) => i.receipt.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    const asc = buildReceiptListView(receipts, null, "asc", costTypes);
    expect(asc.items.map((i) => i.receipt.id)).toEqual(["old", "mid", "new"]);
    expect(asc.items.every((i) => i.match === null)).toBe(true);
  });

  it("U-89: 絞り込み中は当てはまるレシートだけを並び順どおりに返し、「うち」の合計を出す", () => {
    const view = buildReceiptListView(
      receipts,
      { conditions: { category: String(FOOD) }, label: "食費", scope: { kind: "all" }, scopeLabel: "全体" },
      "asc",
      costTypes
    );
    expect(view.items.map((i) => [i.receipt.id, i.match?.matchedAmount])).toEqual([
      ["old", 1000],
      ["new", 2000],
    ]);
    expect(view.matchedTotal).toBe(3000);
  });

  it("U-89: 元の配列は並べ替えない（画面側で解除・並び替えを繰り返しても元データが変わらない）", () => {
    const before = receipts.map((r) => r.id);
    buildReceiptListView(receipts, null, "asc", costTypes);
    expect(receipts.map((r) => r.id)).toEqual(before);
  });
});

describe("buildReceiptListView（フィルタ欄の条件。Issue #39）", () => {
  const search = (patch: Partial<{ payerUserId: string; startDate: string; endDate: string; keyword: string }>) => ({
    payerUserId: null,
    startDate: null,
    endDate: null,
    keyword: null,
    ...patch,
  });

  it("U-148: レシート単位の条件だけのときは、当てはまるレシートを並び順どおりに返し、レシート金額を合計する", () => {
    const view = buildReceiptListView(
      receipts,
      null,
      "asc",
      costTypes,
      search({ startDate: "2026-07-10", endDate: "2026-07-31" })
    );
    expect(view.items.map((i) => i.receipt.id)).toEqual(["mid", "new"]);
    expect(view.items.every((i) => i.match === null)).toBe(true);
    expect(view.matchedTotal).toBe(500 + 2300);
  });

  it("U-148: 返金のレシートはマイナスで合計する", () => {
    const refund = { ...receipt("refund", "2026-07-25T03:00:00.000Z", [item("r1", FOOD, 400)]), transactionTypeName: "返金" };
    const view = buildReceiptListView([...receipts, refund], null, "desc", costTypes, search({ startDate: "2026-07-20" }));
    expect(view.items.map((i) => i.receipt.id)).toEqual(["refund", "new"]);
    expect(view.matchedTotal).toBe(2300 - 400);
  });

  it("U-148: 明細単位の条件と組み合わせたときは、両方に当てはまるレシートの「うち」を合計する", () => {
    const view = buildReceiptListView(
      receipts,
      { conditions: { category: String(FOOD) }, label: "食費", scope: { kind: "all" }, scopeLabel: "全体" },
      "asc",
      costTypes,
      search({ keyword: "n2" }) // 「new」の日用品の明細の商品名
    );
    expect(view.items.map((i) => [i.receipt.id, i.match?.matchedAmount])).toEqual([["new", 2000]]);
    expect(view.matchedTotal).toBe(2000);
  });

  it("U-148: 当てはまるレシートがなければ空", () => {
    const view = buildReceiptListView(receipts, null, "asc", costTypes, search({ payerUserId: "user-b" }));
    expect(view.items).toEqual([]);
    expect(view.matchedTotal).toBe(0);
  });
});

describe("describeListConditions", () => {
  const members = [
    { userId: "user-a", displayName: "A" },
    { userId: "user-b", displayName: "B" },
  ];

  it("U-149: 明細単位の条件・表示対象・レシート単位の条件を順に並べる", () => {
    expect(
      describeListConditions(
        {
          conditions: { category: String(FOOD) },
          label: "食費",
          scope: { kind: "user", userId: "user-a", includeJoint: true },
          scopeLabel: "A＋共同1/2",
        },
        { payerUserId: "user-b", startDate: "2026-07-01", endDate: null, keyword: "牛乳" },
        members
      )
    ).toEqual(["食費", "負担者：A＋共同1/2", "支払者：B", "7/1〜", "「牛乳」を含む"]);
  });

  it("U-149: 分析画面からの総支出・全体は今までどおり、フィルタ欄の条件だけならその条件だけ", () => {
    expect(
      describeListConditions(
        { conditions: {}, label: null, scope: { kind: "all" }, scopeLabel: "全体" },
        null,
        members
      )
    ).toEqual(["総支出", "全体"]);
    expect(
      describeListConditions(
        null,
        { payerUserId: "user-a", startDate: null, endDate: null, keyword: null },
        members
      )
    ).toEqual(["支払者：A"]);
  });
});
