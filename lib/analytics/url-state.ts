// 分析画面の状態とURLの対応（docs/支出分析機能/詳細設計書.md 6.2節、フェーズ2 4.3節、フェーズ3 4章）。
// レシート一覧からブラウザの「戻る」で戻ったとき、画面の部品は作り直されるが、
// URLにはreplaceStateで保存した状態が残っているため、そこから状態を読み直す。

import type { AnalyticsData } from "@/lib/analytics/types";

export type ChartType = "pie" | "trend";

export type AnalyticsState = {
  scopeUserId: string | null; // null＝全体
  includeJoint: boolean;
  month: string; // 円グラフで表示する月
  chart: ChartType;
  categoryId: number | null; // 推移グラフのカテゴリ。null＝総支出
  trendMonth: string | null; // 推移グラフで選択中の月。null＝未選択
};

// URLの値を検証して状態に変換する。不正な値は初期値
// （全体・共同オフ・当月・円グラフ・総支出・月未選択）に戻す。
export function parseAnalyticsState(
  get: (key: string) => string | null | undefined,
  data: Pick<AnalyticsData, "members" | "months" | "categories">
): AnalyticsState {
  const scope = get("scope");
  const scopeUserId = data.members.some((m) => m.userId === scope) ? scope! : null;
  const month = get("month");
  const trendMonth = get("trendMonth");
  return {
    scopeUserId,
    includeJoint: scopeUserId !== null && get("joint") === "1",
    month: month && data.months.includes(month) ? month : data.months[data.months.length - 1],
    chart: get("chart") === "trend" ? "trend" : "pie",
    categoryId: data.categories.find((c) => String(c.id) === get("category"))?.id ?? null,
    trendMonth: trendMonth && data.months.includes(trendMonth) ? trendMonth : null,
  };
}

// 状態をURLのクエリに変換する。
export function serializeAnalyticsState(state: AnalyticsState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("scope", state.scopeUserId ?? "all");
  if (state.scopeUserId !== null && state.includeJoint) {
    params.set("joint", "1");
  }
  params.set("month", state.month);
  params.set("chart", state.chart);
  params.set("category", state.categoryId === null ? "total" : String(state.categoryId));
  if (state.trendMonth !== null) {
    params.set("trendMonth", state.trendMonth);
  }
  return params;
}
