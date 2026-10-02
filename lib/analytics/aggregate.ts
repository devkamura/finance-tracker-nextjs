// 支出分析の集計ロジック（docs/支出分析機能/詳細設計書.md 5章）。
// サーバー通信なしで画面操作に即応するため、クライアント側で呼ぶ純粋関数として実装する。

import type { AnalyticsRow, Scope } from "@/lib/analytics/types";

export type CategorySum = { categoryId: number; amount: number };

// 表示対象に応じた行の重み。対象外の行は0。
// 共同トグルがオンのとき、共同（ownerUserId=null）の行は1/2を計上する（基本設計書3.2節）。
// 1/2で生じる0.5円は丸めずにそのまま扱う（詳細設計書5.2節）。
function weightFor(row: AnalyticsRow, scope: Scope): number {
  if (scope.kind === "all") return 1;
  if (row.ownerUserId === scope.userId) return 1;
  if (row.ownerUserId === null && scope.includeJoint) return 0.5;
  return 0;
}

// 指定した月・表示対象の、カテゴリごとの合計を金額の大きい順に返す。
// 該当する行が1件もないカテゴリは含めない（行はあるが合計0円のカテゴリは含める）。
export function sumByCategory(
  rows: AnalyticsRow[],
  scope: Scope,
  month: string
): CategorySum[] {
  const sums = new Map<number, number>();
  for (const row of rows) {
    if (row.month !== month) continue;
    const weight = weightFor(row, scope);
    if (weight === 0) continue;
    sums.set(row.categoryId, (sums.get(row.categoryId) ?? 0) + row.amount * weight);
  }
  return Array.from(sums, ([categoryId, amount]) => ({ categoryId, amount })).sort(
    (a, b) => b.amount - a.amount || a.categoryId - b.categoryId
  );
}

export type PieSlice = CategorySum & { percent: number };

export type PieData = {
  slices: PieSlice[]; // 金額がプラスのカテゴリ（円グラフの扇）
  negatives: CategorySum[]; // 返金が支出を上回りマイナスになったカテゴリ（注意書き用）
  zeroCategories: CategorySum[]; // 合計がちょうど0円のカテゴリ（表にのみ表示）
  total: number; // 実際の合計（マイナスも含む）
  positiveTotal: number; // ％の分母（プラスのカテゴリの合計）
};

// 円グラフ用のデータを作る（基本設計書3.7節）。
// マイナスのカテゴリは描画上0として扇から外し、％はプラスのカテゴリの合計を分母にする。
// 金額（total）は実際の値のまま返す。
export function buildPieData(categorySums: CategorySum[]): PieData {
  const positives = categorySums.filter((c) => c.amount > 0);
  const positiveTotal = positives.reduce((sum, c) => sum + c.amount, 0);
  return {
    slices: positives.map((c) => ({
      ...c,
      percent: Math.round((c.amount / positiveTotal) * 1000) / 10,
    })),
    negatives: categorySums.filter((c) => c.amount < 0),
    zeroCategories: categorySums.filter((c) => c.amount === 0),
    total: categorySums.reduce((sum, c) => sum + c.amount, 0),
    positiveTotal,
  };
}

// 金額の表示（詳細設計書5.2節・6.1節）。
// 共同1/2による0.5円は小数第1位まで表示し、整数のときは小数を付けない。マイナスは「−」で表す。
export function formatYen(amount: number): string {
  const abs = Math.abs(amount);
  const text = Number.isInteger(abs)
    ? abs.toLocaleString("ja-JP")
    : abs.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${amount < 0 ? "−" : ""}${text}円`;
}
