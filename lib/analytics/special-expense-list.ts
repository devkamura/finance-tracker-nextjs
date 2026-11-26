// 直近12ヶ月の特別費の一覧画面（/analytics/special-expenses。Issue #41 要件10）の、
// URL と表示内容を作る純粋関数。docs/仕様書/#41_…/詳細設計書.md 6.6節。
//
// 分析画面の「直近12ヶ月の特別費」（lib/analytics/aggregate.ts の specialExpenseTotal）と
// 同じ按分・重み・符号で計算し（drilldown.ts の matchReceipt を使う）、一覧の合計が分析画面の金額と必ず一致するようにする。
// 分析画面（Client Component）からも使うため server-only にはしない。

import { costTypeMap } from "@/lib/analytics/dimensions";
import { matchReceipt, type ReceiptMatch } from "@/lib/analytics/drilldown";
import { monthKeyOf } from "@/lib/analytics/months";
import type { Scope } from "@/lib/analytics/types";
import type { ReceiptListItem } from "@/types/receipt";

export const SPECIAL_EXPENSE_LIST_PATH = "/analytics/special-expenses";

// レシート詳細へ移るときの移動元（lib/receipts/list-params.ts の from と同じパラメータ）。
// 詳細画面の「戻る」を特別費の一覧に向けるために使う。
export const SPECIAL_EXPENSE_SOURCE = "special-expense";

// 特別費の一覧画面が URL で受け取る項目。ret は「← 分析に戻る」で開く分析画面の状態
type RawSearchParams = Partial<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// 分析画面から特別費の一覧へのURLを作る（表示対象と、戻り先の分析画面の状態を持たせる）
export function buildSpecialExpenseListHref(scope: Scope, returnState?: URLSearchParams): string {
  const params = new URLSearchParams();
  params.set("scope", scope.kind === "all" ? "all" : scope.userId);
  if (scope.kind === "user" && scope.includeJoint) params.set("joint", "1");
  if (returnState) params.set("ret", returnState.toString());
  return `${SPECIAL_EXPENSE_LIST_PATH}?${params.toString()}`;
}

// URL の表示対象を読む。グループ外のユーザー・指定なしは全体にする。
export function parseSpecialExpenseScope(
  searchParams: RawSearchParams,
  members: { userId: string }[]
): Scope {
  const scope = firstValue(searchParams.scope);
  const member = members.find((m) => m.userId === scope);
  return member
    ? { kind: "user", userId: member.userId, includeJoint: firstValue(searchParams.joint) === "1" }
    : { kind: "all" };
}

// 特別費の一覧からレシート詳細へ移るときに引き継ぐパラメータ（詳細 → 編集 → 詳細と移っても残る）。
// 項目は lib/receipts/list-params.ts の LIST_PARAM_KEYS に含まれるもの（from・scope・joint・ret）だけを使う。
export function specialExpenseDetailParams(searchParams: RawSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  params.set("from", SPECIAL_EXPENSE_SOURCE);
  for (const key of ["scope", "joint", "ret"] as const) {
    const value = firstValue(searchParams[key]);
    if (value) params.set(key, value);
  }
  return params;
}

// レシート詳細の「戻る」の行き先。特別費の一覧から来たときだけ一覧のURLを返し、それ以外は null。
export function specialExpenseBackHref(searchParams: RawSearchParams): string | null {
  if (firstValue(searchParams.from) !== SPECIAL_EXPENSE_SOURCE) return null;
  const params = new URLSearchParams();
  for (const key of ["scope", "joint", "ret"] as const) {
    const value = firstValue(searchParams[key]);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${SPECIAL_EXPENSE_LIST_PATH}?${query}` : SPECIAL_EXPENSE_LIST_PATH;
}

export type SpecialExpenseListMonth = {
  month: string; // "2026-11"
  total: number; // その月の特別費の合計
  items: { receipt: ReceiptListItem; match: ReceiptMatch }[];
};

export type SpecialExpenseListView = {
  total: number; // 12ヶ月の合計（分析画面の「直近12ヶ月の特別費」と一致する）
  months: SpecialExpenseListMonth[]; // 新しい月から順。該当のない月は含めない
};

// レシートから、表示対象の特別費の明細だけを選んで、月ごとに新しい順に並べる。
// 表示対象の特別費の明細がないレシート（相方の個人分だけなど）は出さない。
// 月の判定は分析画面と同じ（monthKeyOf。サーバーのタイムゾーン＝日本時間）。
export function buildSpecialExpenseListView(
  receipts: ReceiptListItem[],
  scope: Scope
): SpecialExpenseListView {
  // 費用区分の条件は使わないため、費用区分の表は空でよい
  const costTypes = costTypeMap([]);
  const byMonth = new Map<string, SpecialExpenseListMonth>();

  const sorted = [...receipts].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
  );
  for (const receipt of sorted) {
    const match = matchReceipt(
      receipt,
      { conditions: { specialExpense: "special" }, scope },
      costTypes
    );
    if (match.matchedItemIds.length === 0) continue;
    const month = monthKeyOf(new Date(receipt.occurredAt));
    const group = byMonth.get(month) ?? { month, total: 0, items: [] };
    group.items.push({ receipt, match });
    group.total += match.matchedAmount;
    byMonth.set(month, group);
  }

  const months = Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));
  return { total: months.reduce((sum, m) => sum + m.total, 0), months };
}
