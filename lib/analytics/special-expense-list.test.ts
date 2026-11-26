// 単体テスト：直近12ヶ月の特別費の一覧（Issue #41 要件10。docs/test-spec.md U-161〜U-162）。

import { describe, expect, it } from "vitest";

import {
  buildSpecialExpenseListHref,
  buildSpecialExpenseListView,
  parseSpecialExpenseScope,
  specialExpenseBackHref,
  specialExpenseDetailParams,
} from "@/lib/analytics/special-expense-list";
import { buildAnalyticsReturnHref, pickListParams } from "@/lib/receipts/list-params";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const USER_A = "user-a";
const USER_B = "user-b";
const members = [{ userId: USER_A }, { userId: USER_B }];

function item(
  id: string,
  price: number,
  ownerUserId: string | null,
  isSpecialExpense: boolean
): ReceiptDetailItemView {
  return {
    id,
    itemName: id,
    price,
    taxType: "inclusive",
    taxRateName: null,
    taxRateMultiplier: null,
    categoryId: 1,
    categoryName: "宿泊・旅行",
    breakdownId: null,
    breakdownName: null,
    counterpartId: 21,
    counterpartName: "ふたり",
    ownerUserId,
    ownerDisplayName: ownerUserId ?? "共同",
    ownerColor: null,
    tagNames: [],
    isSpecialExpense,
  };
}

function receipt(
  id: string,
  occurredAt: string,
  amount: number,
  items: ReceiptDetailItemView[],
  refund = false
): ReceiptListItem {
  return {
    id,
    occurredAt,
    payeeId: null,
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

// 日付は月の境目を避けて日中にする（テストの実行環境のタイムゾーンに左右されないように）
const RECEIPTS = [
  // 9月：宿泊費（共同・特別費）
  receipt("hotel", "2026-09-14T03:00:00.000Z", 30000, [item("hotel-1", 30000, null, true)]),
  // 11月：お土産（A・特別費）と野菜（共同・通常）が混ざる。1割引で按分（1,800／900）
  receipt("market", "2026-11-15T03:00:00.000Z", 2700, [
    item("market-1", 2000, USER_A, true),
    item("market-2", 1000, null, false),
  ]),
  // 11月：キャンセル料の返金（共同・特別費）
  receipt("refund", "2026-11-20T03:00:00.000Z", 4000, [item("refund-1", 4000, null, true)], true),
  // 10月：B の個人の特別費（A の表示対象では出ない）
  receipt("b-only", "2026-10-10T03:00:00.000Z", 5000, [item("b-only-1", 5000, USER_B, true)]),
];

describe("特別費の一覧", () => {
  it("U-161: 月ごとに新しい順に並び、按分・表示対象・返金を反映した合計になる", () => {
    const all = buildSpecialExpenseListView(RECEIPTS, { kind: "all" });
    expect(all.months.map((m) => m.month)).toEqual(["2026-11", "2026-10", "2026-09"]);
    // 11月：お土産 1,800（按分後）− 返金 4,000。新しい順（返金 → 道の駅）
    expect(all.months[0].items.map((i) => i.receipt.id)).toEqual(["refund", "market"]);
    expect(all.months[0].items[1].match).toEqual({ matchedItemIds: ["market-1"], matchedAmount: 1800 });
    expect(all.months[0].total).toBe(-2200);
    expect(all.total).toBe(-2200 + 5000 + 30000);

    // A＋共同1/2：B の個人分は出ない。共同は半分
    const a = buildSpecialExpenseListView(RECEIPTS, { kind: "user", userId: USER_A, includeJoint: true });
    expect(a.months.map((m) => m.month)).toEqual(["2026-11", "2026-09"]);
    expect(a.total).toBe(1800 - 2000 + 15000);

    // A（共同なし）：お土産だけ
    const aOnly = buildSpecialExpenseListView(RECEIPTS, {
      kind: "user",
      userId: USER_A,
      includeJoint: false,
    });
    expect(aOnly.months.flatMap((m) => m.items.map((i) => i.receipt.id))).toEqual(["market"]);
    expect(aOnly.total).toBe(1800);

    expect(buildSpecialExpenseListView([], { kind: "all" })).toEqual({ total: 0, months: [] });
  });

  it("U-162: 一覧へのURL・表示対象の読み取り・詳細との行き来・分析画面への戻り先", () => {
    const ret = new URLSearchParams("scope=user-a&joint=1&month=2026-11&chart=pie&special=1");
    const href = buildSpecialExpenseListHref({ kind: "user", userId: USER_A, includeJoint: true }, ret);
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/analytics/special-expenses");
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({ scope: USER_A, joint: "1" });

    expect(parseSpecialExpenseScope(params, members)).toEqual({
      kind: "user",
      userId: USER_A,
      includeJoint: true,
    });
    // グループ外・指定なしは全体
    expect(parseSpecialExpenseScope({ scope: "stranger" }, members)).toEqual({ kind: "all" });
    expect(parseSpecialExpenseScope({}, members)).toEqual({ kind: "all" });
    expect(buildSpecialExpenseListHref({ kind: "all" })).toBe("/analytics/special-expenses?scope=all");

    // 詳細へは from=special-expense と表示対象・戻り先を引き継ぎ、詳細 → 編集 → 詳細でも残る
    const detailParams = specialExpenseDetailParams(params);
    expect(detailParams.get("from")).toBe("special-expense");
    const afterEdit = pickListParams(Object.fromEntries(detailParams));
    expect(afterEdit.get("from")).toBe("special-expense");
    expect(afterEdit.get("ret")).toBe(ret.toString());

    // 詳細の「戻る」は特別費の一覧へ（同じ表示対象・戻り先）。ほかから来たときは null
    const back = specialExpenseBackHref(Object.fromEntries(afterEdit));
    expect(back).toBe(href);
    expect(specialExpenseBackHref({ from: "analytics" })).toBeNull();
    expect(specialExpenseBackHref({})).toBeNull();

    // 「← 分析に戻る」は元の分析画面の状態（特別費を含める も残る）
    expect(buildAnalyticsReturnHref(params.ret)).toBe(`/analytics?${ret.toString()}`);
  });
});
