// レシート一覧の表示内容（絞り込み・並び替え）を作る純粋関数
// （docs/支出分析機能/詳細設計書.md フェーズ3 5章）。
// その月のレシートはサーバーから1回だけ取得し、絞り込み・解除・並び替えはこの関数で
// 画面側だけで行う（サーバー通信なし）。将来の任意フィルタ（要件定義書32〜33章）も
// ここに条件を足して対応する。

import { matchReceipt, type ReceiptMatch } from "@/lib/analytics/drilldown";
import type { ReceiptListFilter } from "@/lib/receipts/list-params";
import type { ReceiptListItem } from "@/types/receipt";

export type ReceiptSort = "asc" | "desc";

export type ReceiptListViewItem = {
  receipt: ReceiptListItem;
  match: ReceiptMatch | null; // 絞り込み中のみ
};

export type ReceiptListView = {
  items: ReceiptListViewItem[];
  matchedTotal: number; // 絞り込み中の「うち」の合計（分析画面のグラフの値と一致する）
};

export function buildReceiptListView(
  receipts: ReceiptListItem[],
  filter: ReceiptListFilter | null,
  sort: ReceiptSort
): ReceiptListView {
  const sorted = [...receipts].sort((a, b) => {
    const diff = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    return sort === "asc" ? diff : -diff;
  });

  if (!filter) {
    return { items: sorted.map((receipt) => ({ receipt, match: null })), matchedTotal: 0 };
  }

  // 条件に当てはまる明細を1件以上含むレシートだけを残す
  const items = sorted
    .map((receipt) => ({ receipt, match: matchReceipt(receipt, filter) }))
    .filter((item) => item.match.matchedItemIds.length > 0);
  const matchedTotal = items.reduce((sum, item) => sum + item.match.matchedAmount, 0);
  return { items, matchedTotal };
}
