// 結合テスト（モジュール間の連携）：特別費フラグの分析画面とレシート一覧の金額の一致（Issue #41。I-61）。
// 分析の集計（queries → url-state → aggregate）と、同じ条件で作った一覧の URL
// （list-params → list-view → drilldown）を画面と同じ順番で通し、合計が一致することを確かめる。
// DB は使わないため、通常の `npm test` で実行する。

import { describe, expect, it } from "vitest";

import { specialExpenseTotal, sumByDimension, sumByMonth } from "@/lib/analytics/aggregate";
import { costTypeMap, type Conditions } from "@/lib/analytics/dimensions";
import { buildAnalyticsRows } from "@/lib/analytics/queries";
import type { Scope } from "@/lib/analytics/types";
import { analysisConditions, type AnalyticsFilter } from "@/lib/analytics/url-state";
import { buildFilteredListHref, parseListFilter } from "@/lib/receipts/list-params";
import { buildReceiptListView } from "@/lib/receipts/list-view";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const USER_A = "user-a";
const USER_B = "user-b";
const FOOD = 1;
const TRAVEL = 2;
const MONTH = "2026-11";
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
const members = [
  { userId: USER_A, displayName: "A" },
  { userId: USER_B, displayName: "B" },
];

type DetailInput = {
  price: number;
  categoryId: number;
  owner: string | null;
  special: boolean;
  multiplier?: number; // 税別のときの倍率
};
type ReceiptInput = {
  id: string;
  amount: number;
  payer: string;
  refund?: boolean;
  details: DetailInput[];
};

// テストデータ：特別費と通常が混ざるレシート（共同・個人・税別・返金・支払額のずれを含む）
const RECEIPTS: ReceiptInput[] = [
  {
    // 旅行先のスーパー：通常の食費（共同）と、旅行の特別費（共同）が1枚に混ざる。1割引
    id: "r1",
    amount: 4500,
    payer: USER_A,
    details: [
      { price: 2000, categoryId: FOOD, owner: null, special: false },
      { price: 3000, categoryId: TRAVEL, owner: null, special: true },
    ],
  },
  {
    // 宿泊費（全額が特別費、A の個人分と共同）
    id: "r2",
    amount: 33000,
    payer: USER_B,
    details: [
      { price: 20000, categoryId: TRAVEL, owner: null, special: true, multiplier: 1.1 },
      { price: 10000, categoryId: TRAVEL, owner: USER_A, special: true, multiplier: 1.1 },
    ],
  },
  {
    // ふだんの買い物（通常のみ）
    id: "r3",
    amount: 1200,
    payer: USER_A,
    details: [
      { price: 800, categoryId: FOOD, owner: USER_B, special: false },
      { price: 400, categoryId: FOOD, owner: null, special: false },
    ],
  },
  {
    // 旅行のキャンセル料の一部返金（特別費の返金）
    id: "r4",
    amount: 5000,
    payer: USER_B,
    refund: true,
    details: [{ price: 5000, categoryId: TRAVEL, owner: null, special: true }],
  },
];

function toRawReceipt(r: ReceiptInput) {
  return {
    id: r.id,
    occurred_at: "2026-11-10T03:00:00.000Z",
    amount: r.amount,
    payee_id: null,
    payer_user_id: r.payer,
    transaction_types: { name: r.refund ? "返金" : "支出" },
    receipt_details: r.details.map((d) => ({
      price: d.price,
      tax_type: d.multiplier ? ("exclusive" as const) : ("inclusive" as const),
      category_id: d.categoryId,
      breakdown_id: null,
      counterpart_id: 21,
      owner_user_id: d.owner,
      is_special_expense: d.special,
      consumption_taxes: d.multiplier ? { multiplier: d.multiplier } : null,
    })),
  };
}

function toListReceipt(r: ReceiptInput): ReceiptListItem {
  const items: ReceiptDetailItemView[] = r.details.map((d, index) => ({
    id: `${r.id}-${index}`,
    itemName: `${r.id}-${index}`,
    price: d.price,
    taxType: d.multiplier ? "exclusive" : "inclusive",
    taxRateName: d.multiplier ? "10%" : null,
    taxRateMultiplier: d.multiplier ?? null,
    categoryId: d.categoryId,
    categoryName: d.categoryId === FOOD ? "食費" : "旅行",
    breakdownId: null,
    breakdownName: null,
    counterpartId: 21,
    counterpartName: "ふたり",
    ownerUserId: d.owner,
    ownerDisplayName: d.owner ?? "共同",
    ownerColor: null,
    tagNames: [],
    isSpecialExpense: d.special,
  }));
  return {
    id: r.id,
    occurredAt: "2026-11-10T03:00:00.000Z",
    payeeId: null,
    payeeName: r.id,
    amount: r.amount,
    transactionTypeName: r.refund ? "返金" : "支出",
    payerUserId: r.payer,
    payerDisplayName: r.payer,
    payerColor: null,
    receiptImageUrl: null,
    isDuplicated: false,
    createdByDisplayName: r.payer,
    items,
  };
}

const rows = buildAnalyticsRows(RECEIPTS.map(toRawReceipt));
const listReceipts = RECEIPTS.map(toListReceipt);

const SCOPES: Scope[] = [
  { kind: "all" },
  { kind: "user", userId: USER_A, includeJoint: false },
  { kind: "user", userId: USER_A, includeJoint: true },
  { kind: "user", userId: USER_B, includeJoint: true },
];

// 分析画面のリンクと同じ URL を作り、一覧画面と同じ手順で読み直して合計を求める
function listTotal(conditions: Conditions, scope: Scope): number {
  const href = buildFilteredListHref({ month: MONTH, conditions, scope, from: "analytics" });
  const params = Object.fromEntries(new URL(href, "http://localhost").searchParams);
  const filter = parseListFilter(params, master, members);
  return buildReceiptListView(listReceipts, filter, "desc", costTypes).matchedTotal;
}

function analyticsTotal(conditions: Conditions, scope: Scope): number {
  return sumByMonth(rows, scope, [MONTH], conditions, costTypes)[0].amount;
}

describe("特別費：分析画面とレシート一覧の連携（I-61）", () => {
  const specialFilter: AnalyticsFilter = { dimension: "specialExpense", key: "special" };

  it("I-61: ①除く ②含める ③絞り込み「特別費」で、分析の合計と一覧の合計が一致し、①＋③＝②", () => {
    for (const scope of SCOPES) {
      const excluded = analysisConditions(null, null, false);
      const included = analysisConditions(null, null, true);
      const specialOnly = analysisConditions(specialFilter, null, false);

      const totals = [excluded, included, specialOnly].map((conditions) => {
        const analytics = analyticsTotal(conditions, scope);
        expect(listTotal(conditions, scope)).toBeCloseTo(analytics, 6);
        return analytics;
      });
      expect(totals[0] + totals[2]).toBeCloseTo(totals[1], 6);
    }

    // 全体の具体的な金額：通常 1,800（r1）＋1,200（r3）、特別費 2,700（r1）＋33,000（r2）−5,000（r4）
    const all: Scope = { kind: "all" };
    expect(analyticsTotal(analysisConditions(null, null, false), all)).toBe(3000);
    expect(analyticsTotal(analysisConditions(specialFilter, null, false), all)).toBe(30700);
    expect(analyticsTotal(analysisConditions(null, null, true), all)).toBe(33700);
  });

  it("I-61: ⑤直近12ヶ月の特別費は、推移グラフの「絞り込み：特別費」の合計・一覧の合計と一致する", () => {
    for (const scope of SCOPES) {
      const total = specialExpenseTotal(rows, scope, [MONTH], costTypes);
      expect(total).toBeCloseTo(analyticsTotal(analysisConditions(specialFilter, null, false), scope), 6);
      expect(total).toBeCloseTo(listTotal({ specialExpense: "special" }, scope), 6);
    }
    expect(specialExpenseTotal(rows, { kind: "all" }, [MONTH], costTypes)).toBe(30700);
  });

  it("I-61: ④円グラフの各行（分ける「特別費」・カテゴリ×除く）から開いた一覧の合計が行の金額と一致する", () => {
    for (const scope of SCOPES) {
      for (const [split, include] of [
        ["specialExpense", false],
        ["category", false],
        ["category", true],
      ] as const) {
        const conditions = analysisConditions(null, split, include);
        const sums = sumByDimension(rows, scope, MONTH, split, conditions, costTypes);
        for (const { key, amount } of sums) {
          // 分析画面の行のリンクと同じく、行の値を条件に重ねる
          expect(listTotal({ ...conditions, [split]: key }, scope)).toBeCloseTo(amount, 6);
        }
      }
    }
  });
});
