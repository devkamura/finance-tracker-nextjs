// 結合テスト（モジュール間の連携）：レシート一覧のフィルタ（Issue #39）。
// URLパラメータ → 条件の読み取り（list-params・list-search） → 一覧の表示内容（list-view・drilldown）
// → 詳細画面への引き継ぎ（pickListParams）の流れを、画面（ReceiptListView）と同じ順番で通す。
// DBは使わない（取得済みのレシートを画面側だけで絞るため）ので、通常の `npm test` で実行する。

import { describe, expect, it } from "vitest";

import { costTypeMap } from "@/lib/analytics/dimensions";
import { parseListFilter, pickListParams } from "@/lib/receipts/list-params";
import {
  parseListSearch,
  withUserSelection,
  type ListConditionParams,
} from "@/lib/receipts/list-search";
import { buildReceiptListView, describeListConditions } from "@/lib/receipts/list-view";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const FOOD = 1;
const DAILY = 2;
const master = {
  categories: [
    { id: FOOD, name: "食費", costType: "variable" as const },
    { id: DAILY, name: "日用品", costType: "variable" as const },
  ],
  breakdowns: [],
  counterparts: [],
  payees: [],
};
const costTypes = costTypeMap(master.categories);
const members = [
  { userId: "user-a", displayName: "A" },
  { userId: "user-b", displayName: "B" },
];
const MONTH = "2026-07";

function item(
  id: string,
  categoryId: number,
  price: number,
  ownerUserId: string | null
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
    breakdownId: null,
    breakdownName: null,
    counterpartId: 21,
    counterpartName: "ふたり",
    ownerUserId,
    ownerDisplayName: ownerUserId ?? "共同",
    ownerColor: null,
    tagNames: [],
  };
}

function receipt(
  id: string,
  day: number,
  payerUserId: string,
  payeeName: string,
  items: ReceiptDetailItemView[]
): ReceiptListItem {
  return {
    id,
    // 日本時間の正午
    occurredAt: `2026-07-${String(day).padStart(2, "0")}T03:00:00.000Z`,
    payeeId: null,
    payeeName,
    amount: items.reduce((sum, i) => sum + i.price, 0),
    transactionTypeName: "支出",
    payerUserId,
    payerDisplayName: payerUserId === "user-a" ? "A" : "B",
    payerColor: null,
    receiptImageUrl: null,
    isDuplicated: false,
    createdByDisplayName: "A",
    items,
  };
}

// 7月のレシート
const receipts = [
  // A が支払い。共同の食費 2,000
  receipt("r1", 3, "user-a", "スーパー", [item("牛乳", FOOD, 2000, null)]),
  // B が支払い。A の日用品 1,000・B の食費 500
  receipt("r2", 8, "user-b", "ドラッグストア", [
    item("洗剤", DAILY, 1000, "user-a"),
    item("お菓子", FOOD, 500, "user-b"),
  ]),
  // A が支払い。B の食費 3,000
  receipt("r3", 20, "user-a", "コーヒー豆店", [item("コーヒー豆", FOOD, 3000, "user-b")]),
];

// 画面（ReceiptListView）と同じ順番で、URLの条件から一覧の表示内容を作る
function viewFor(params: ListConditionParams) {
  const filter = parseListFilter(params, master, members);
  const search = parseListSearch(params, MONTH, members);
  const view = buildReceiptListView(receipts, filter, "asc", costTypes, search);
  return {
    ids: view.items.map((i) => i.receipt.id),
    total: view.matchedTotal,
    parts: describeListConditions(filter, search, members),
  };
}

describe("レシート一覧のフィルタ（URL → 条件 → 一覧）", () => {
  it("I-57: 支払者と負担者で結果が変わる", () => {
    // 支払者：A → A が立て替えた r1・r3。合計はレシート金額
    const payer = viewFor(
      withUserSelection({}, { userId: "user-a", basis: "payer", includeJoint: false })
    );
    expect(payer).toEqual({ ids: ["r1", "r3"], total: 5000, parts: ["支払者：A"] });

    // 負担者：A（共同なし）→ A の明細がある r2。合計は A の負担分
    const burden = viewFor(
      withUserSelection({}, { userId: "user-a", basis: "burden", includeJoint: false })
    );
    expect(burden).toEqual({ ids: ["r2"], total: 1000, parts: ["総支出", "負担者：A"] });

    // 負担者：A＋共同1/2 → r1 の共同の半分も入る
    const joint = viewFor(
      withUserSelection({}, { userId: "user-a", basis: "burden", includeJoint: true })
    );
    expect(joint).toEqual({
      ids: ["r1", "r2"],
      total: 1000 + 1000,
      parts: ["総支出", "負担者：A＋共同1/2"],
    });
  });

  it("I-57: 分析画面からの条件（食費・全体）とフィルタ欄の条件を AND で組み合わせる", () => {
    const fromAnalytics: ListConditionParams = { category: String(FOOD), scope: "all" };
    expect(viewFor(fromAnalytics).ids).toEqual(["r1", "r2", "r3"]);

    // 期間（7/5〜7/31）を加える → r2・r3。合計は食費の明細だけ（500＋3,000）
    const withPeriod = viewFor({ ...fromAnalytics, start: "2026-07-05", end: "2026-07-31" });
    expect(withPeriod).toEqual({
      ids: ["r2", "r3"],
      total: 3500,
      parts: ["食費", "全体", "7/5〜7/31"],
    });

    // さらにキーワード「コーヒー」→ r3 だけ
    expect(
      viewFor({ ...fromAnalytics, start: "2026-07-05", end: "2026-07-31", q: "コーヒー" }).ids
    ).toEqual(["r3"]);
  });

  it("I-57: 全員に戻すと、分析画面から渡された全体も外れ、カテゴリの条件だけが残る", () => {
    const params = withUserSelection(
      { category: String(DAILY), scope: "user-a" },
      { userId: null, basis: "burden", includeJoint: false }
    );
    expect(params).toEqual({ category: String(DAILY) });
    expect(viewFor(params)).toEqual({ ids: ["r2"], total: 1000, parts: ["日用品", "全体"] });
  });

  it("I-57: 条件は詳細画面へのURLに引き継がれ、戻ったときに同じ一覧になる", () => {
    const conditions: ListConditionParams = { payer: "user-a", start: "2026-07-10", q: "豆" };
    const before = viewFor(conditions);
    expect(before.ids).toEqual(["r3"]);

    // 画面と同じように一覧のURLを作り、引き継ぎ用のパラメータだけを取り出して読み直す
    const url = new URLSearchParams({ month: MONTH, sort: "asc", ...conditions, open: "r3" });
    const restored = Object.fromEntries(pickListParams(Object.fromEntries(url)).entries());
    expect(viewFor(restored)).toEqual(before);
  });

  it("I-57: 月を切り替えた先で残った期間（別の月の日付）は無視される", () => {
    // 8月の期間が7月の一覧に渡っても、その条件では絞らない
    expect(viewFor({ start: "2026-08-01", payer: "user-b" })).toEqual({
      ids: ["r2"],
      total: 1500,
      parts: ["支払者：B"],
    });
  });
});
