// レシート一覧の表示内容（絞り込み・並び替え）を作る純粋関数
// （docs/全体仕様書/基本設計書.md 5.6節）。
// その月のレシートはサーバーから1回だけ取得し、絞り込み・解除・並び替えはこの関数で
// 画面側だけで行う（サーバー通信なし）。将来の任意フィルタ（要件定義書32〜33章）も
// ここに条件を足して対応する。
// 一覧画面のフィルタ欄の条件（支払者・期間・キーワード。Issue #39）はレシート単位で先に絞り、
// その後で明細単位の条件（負担者・カテゴリなど）を当てる。

import type { CostTypeMap } from "@/lib/analytics/dimensions";
import { matchReceipt, type ReceiptMatch } from "@/lib/analytics/drilldown";
import type { ReceiptListFilter } from "@/lib/receipts/list-params";
import { matchesSearch, searchLabels, type ReceiptListSearch } from "@/lib/receipts/list-search";
import type { ReceiptListItem } from "@/types/receipt";

export type ReceiptSort = "asc" | "desc";

export type ReceiptListViewItem = {
  receipt: ReceiptListItem;
  match: ReceiptMatch | null; // 絞り込み中のみ
};

export type ReceiptListView = {
  items: ReceiptListViewItem[];
  // 絞り込み中の合計。明細単位の条件があるときは「うち」の合計（分析画面のグラフの値と一致する）、
  // レシート単位の条件だけのときは当てはまるレシートの金額の合計（返金はマイナス）。絞り込みなしは0。
  // 画面には出さない（Issue #49）が、一覧の「うち」金額の合計がグラフの金額と一致することを
  // テストで確かめるために残す
  matchedTotal: number;
};

export function buildReceiptListView(
  receipts: ReceiptListItem[],
  filter: ReceiptListFilter | null,
  sort: ReceiptSort,
  costTypes: CostTypeMap,
  search: ReceiptListSearch | null = null
): ReceiptListView {
  const sorted = [...receipts]
    .filter((receipt) => !search || matchesSearch(receipt, search))
    .sort((a, b) => {
      const diff = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
      return sort === "asc" ? diff : -diff;
    });

  if (!filter) {
    const matchedTotal = search
      ? sorted.reduce(
          (sum, r) => sum + (r.transactionTypeName === "返金" ? -r.amount : r.amount),
          0
        )
      : 0;
    return { items: sorted.map((receipt) => ({ receipt, match: null })), matchedTotal };
  }

  // 条件に当てはまる明細を1件以上含むレシートだけを残す
  const items = sorted
    .map((receipt) => ({ receipt, match: matchReceipt(receipt, filter, costTypes) }))
    .filter((item) => item.match.matchedItemIds.length > 0);
  const matchedTotal = items.reduce((sum, item) => sum + item.match.matchedAmount, 0);
  return { items, matchedTotal };
}

// 絞り込み中の表示（バナー）の条件の表示名を並べる。
// 明細単位の条件：「食費 ＞ 外食」（条件なしは「総支出」）と表示対象（「全体」「負担者：A＋共同1/2」）。
// レシート単位の条件：「支払者：A」「10/1〜10/7」「「コーヒー」を含む」。
export function describeListConditions(
  filter: ReceiptListFilter | null,
  search: ReceiptListSearch | null,
  members: { userId: string; displayName: string }[]
): string[] {
  const parts: string[] = [];
  if (filter) {
    parts.push(filter.label ?? "総支出");
    parts.push(filter.scope.kind === "user" ? `負担者：${filter.scopeLabel}` : filter.scopeLabel);
  }
  if (search) parts.push(...searchLabels(search, members));
  return parts;
}
