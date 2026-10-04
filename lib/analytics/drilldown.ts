// グラフからレシート一覧への絞り込み（docs/支出分析機能/詳細設計書.md フェーズ3 5.2節）。
// 分析の集計（lib/analytics/queries.ts・aggregate.ts）と同じ按分・重み・符号で計算し、
// 一覧に出す「うち〇〇円」の合計がグラフの値と必ず一致するようにする。

import { ownerWeight } from "@/lib/analytics/aggregate";
import { matchesConditions, type Conditions, type CostTypeMap } from "@/lib/analytics/dimensions";
import type { Scope } from "@/lib/analytics/types";
import { allocateReceiptAmount } from "@/lib/settlement/calculate";
import type { ReceiptListItem } from "@/types/receipt";

export type DrilldownFilter = {
  // カテゴリ・内訳・費用区分・支払い先・相手の条件（なし＝総支出。docs/分析拡充/詳細設計書.md F4 4章）
  conditions: Conditions;
  scope: Scope;
};

export type ReceiptMatch = {
  matchedItemIds: string[]; // 条件に当てはまる明細のID
  matchedAmount: number; // 当てはまる明細の按分後の金額の合計（共同オンの共同は1/2、返金はマイナス）
};

type MatchableReceipt = Pick<
  ReceiptListItem,
  "amount" | "transactionTypeName" | "payerUserId" | "payeeId" | "items"
>;

// レシート1枚について、条件に当てはまる明細と「うち」の金額を返す。
// 当てはまる明細がなければ matchedItemIds は空になる（一覧には出さない）。
// 費用区分は分析と同じく、今のカテゴリの設定（costTypes）で判定する。
export function matchReceipt(
  receipt: MatchableReceipt,
  filter: DrilldownFilter,
  costTypes: CostTypeMap
): ReceiptMatch {
  const items = receipt.items;
  if (items.length === 0) {
    return { matchedItemIds: [], matchedAmount: 0 };
  }

  const allocated = allocateReceiptAmount({
    payerUserId: receipt.payerUserId,
    amount: receipt.amount,
    isRefund: false, // 按分自体は支出・返金を区別しない（符号反転は下で行う）
    details: items.map((item) => ({
      price: item.price,
      taxType: item.taxType,
      taxRateMultiplier: item.taxRateMultiplier,
      ownerUserId: item.ownerUserId,
    })),
  });
  const sign = receipt.transactionTypeName === "返金" ? -1 : 1;

  const matchedItemIds: string[] = [];
  let matchedAmount = 0;
  items.forEach((item, index) => {
    const values = {
      categoryId: item.categoryId,
      breakdownId: item.breakdownId,
      counterpartId: item.counterpartId,
      payeeId: receipt.payeeId,
    };
    if (!matchesConditions(values, filter.conditions, costTypes)) return;
    const weight = ownerWeight(item.ownerUserId, filter.scope);
    if (weight === 0) return;
    matchedItemIds.push(item.id);
    matchedAmount += allocated[index] * sign * weight;
  });

  return { matchedItemIds, matchedAmount };
}
