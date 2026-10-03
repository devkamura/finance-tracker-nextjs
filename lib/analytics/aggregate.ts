// 支出分析の集計ロジック（docs/支出分析機能/詳細設計書.md 5章）。
// サーバー通信なしで画面操作に即応するため、クライアント側で呼ぶ純粋関数として実装する。

import type { AnalyticsRow, Scope } from "@/lib/analytics/types";

export type CategorySum = { categoryId: number; amount: number };

// 帰属先に応じた重み。表示対象に当てはまらない帰属先は0。
// 共同トグルがオンのとき、共同（ownerUserId=null）は1/2を計上する（基本設計書3.2節）。
// 1/2で生じる0.5円は丸めずにそのまま扱う（詳細設計書5.2節）。
// レシート一覧の絞り込み（lib/analytics/drilldown.ts）でも同じ重みを使い、グラフと金額を一致させる。
export function ownerWeight(ownerUserId: string | null, scope: Scope): number {
  if (scope.kind === "all") return 1;
  if (ownerUserId === scope.userId) return 1;
  if (ownerUserId === null && scope.includeJoint) return 0.5;
  return 0;
}

function weightFor(row: AnalyticsRow, scope: Scope): number {
  return ownerWeight(row.ownerUserId, scope);
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

export type MonthSum = { month: string; amount: number };

// 12ヶ月それぞれの合計を古い順に返す（データのない月は0円）。
// categoryIdがnullなら総支出（全カテゴリ）、数値ならそのカテゴリだけを合計する。
// 表示対象の重み（共同オンなら共同は1/2）はカテゴリ別集計と同じ。
export function sumByMonth(
  rows: AnalyticsRow[],
  scope: Scope,
  months: string[],
  categoryId: number | null
): MonthSum[] {
  const sums = new Map<string, number>(months.map((m) => [m, 0]));
  for (const row of rows) {
    if (categoryId !== null && row.categoryId !== categoryId) continue;
    const current = sums.get(row.month);
    if (current === undefined) continue; // 対象の12ヶ月以外
    sums.set(row.month, current + row.amount * weightFor(row, scope));
  }
  return months.map((month) => ({ month, amount: sums.get(month) ?? 0 }));
}

export type TrendPoint = MonthSum & {
  barValue: number; // 棒の高さ（マイナスは描画上0、基本設計書3.7節）
  mom: number | null; // 前月比（％）。算出しない月はnull
};

export type TrendData = {
  points: TrendPoint[];
  negatives: MonthSum[]; // 金額がマイナスの月（注意書き用）
};

// 推移グラフ用のデータを作る（詳細設計書 フェーズ2 3.2節）。
// 前月比＝当月 ÷ 前月 × 100（前月と同じなら100%）。マイナスが絡む月
// （最初の月・前月が0円以下・当月がマイナス）は％の意味が読み取れないため算出しない。
export function buildTrendData(series: MonthSum[]): TrendData {
  const points = series.map((point, index) => {
    const prev = index > 0 ? series[index - 1].amount : null;
    const mom =
      prev === null || prev <= 0 || point.amount < 0
        ? null
        : Math.round((point.amount / prev) * 1000) / 10;
    return { ...point, barValue: Math.max(point.amount, 0), mom };
  });
  return { points, negatives: series.filter((p) => p.amount < 0) };
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
