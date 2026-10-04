// 支出分析の集計ロジック（docs/支出分析機能/詳細設計書.md 5章、docs/分析拡充/詳細設計書.md F4 3章）。
// サーバー通信なしで画面操作に即応するため、クライアント側で呼ぶ純粋関数として実装する。

import {
  dimensionKey,
  matchesConditions,
  type Conditions,
  type CostTypeMap,
  type Dimension,
} from "@/lib/analytics/dimensions";
import type { AnalyticsRow, Scope } from "@/lib/analytics/types";

// 「分ける」項目の値（カテゴリID・内訳ID・費用区分・支払い先名・相手ID）ごとの合計
export type KeySum = { key: string; amount: number };

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

// 指定した月・表示対象で、絞り込みの条件に当てはまる行を「分ける」項目の値ごとに合計し、
// 金額の大きい順に返す（docs/分析拡充/詳細設計書.md F4 3章）。
// 該当する行が1件もない値は含めない（行はあるが合計0円の値は含める）。
export function sumByDimension(
  rows: AnalyticsRow[],
  scope: Scope,
  month: string,
  dimension: Dimension,
  filter: Conditions,
  costTypes: CostTypeMap
): KeySum[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    if (row.month !== month) continue;
    const weight = weightFor(row, scope);
    if (weight === 0) continue;
    if (!matchesConditions(row, filter, costTypes)) continue;
    const key = dimensionKey(row, dimension, costTypes);
    sums.set(key, (sums.get(key) ?? 0) + row.amount * weight);
  }
  return Array.from(sums, ([key, amount]) => ({ key, amount })).sort(
    (a, b) => b.amount - a.amount || a.key.localeCompare(b.key, "ja", { numeric: true })
  );
}

export type MonthSum = { month: string; amount: number };

// 12ヶ月それぞれの合計を古い順に返す（データのない月は0円）。
// 絞り込みの条件がなければ総支出、あれば条件に当てはまる行だけを合計する。
// 表示対象の重み（共同オンなら共同は1/2）は円グラフの集計と同じ。
export function sumByMonth(
  rows: AnalyticsRow[],
  scope: Scope,
  months: string[],
  filter: Conditions,
  costTypes: CostTypeMap
): MonthSum[] {
  const sums = new Map<string, number>(months.map((m) => [m, 0]));
  for (const row of rows) {
    if (!matchesConditions(row, filter, costTypes)) continue;
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

export type PieSlice = KeySum & { percent: number };

export type PieData = {
  slices: PieSlice[]; // 金額がプラスの値（円グラフの扇）
  negatives: KeySum[]; // 返金が支出を上回りマイナスになった値（注意書き用）
  zeroKeys: KeySum[]; // 合計がちょうど0円の値（表にのみ表示）
  total: number; // 実際の合計（マイナスも含む）
  positiveTotal: number; // ％の分母（プラスの値の合計）
};

// 円グラフ用のデータを作る（基本設計書3.7節）。
// マイナスの値は描画上0として扇から外し、％はプラスの値の合計を分母にする。
// 金額（total）は実際の値のまま返す。
// 絞り込み中は、絞り込み後の合計が分母になる（内訳で分けるときは「内訳なし」も含む。要件定義書 4.6節）。
export function buildPieData(categorySums: KeySum[]): PieData {
  const positives = categorySums.filter((c) => c.amount > 0);
  const positiveTotal = positives.reduce((sum, c) => sum + c.amount, 0);
  return {
    slices: positives.map((c) => ({
      ...c,
      percent: Math.round((c.amount / positiveTotal) * 1000) / 10,
    })),
    negatives: categorySums.filter((c) => c.amount < 0),
    zeroKeys: categorySums.filter((c) => c.amount === 0),
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
