// 分析画面の状態とURLの対応（docs/支出分析機能/詳細設計書.md 6.2節、フェーズ2 4.3節、フェーズ3 4章、
// docs/分析拡充/詳細設計書.md F4 5章）。
// レシート一覧からブラウザの「戻る」で戻ったとき、画面の部品は作り直されるが、
// URLにはreplaceStateで保存した状態が残っているため、そこから状態を読み直す。

import {
  dimensionOptions,
  isDimension,
  type Conditions,
  type Dimension,
  type DimensionMaster,
} from "@/lib/analytics/dimensions";
import type { AnalyticsData } from "@/lib/analytics/types";

export type ChartType = "pie" | "trend";

// 絞り込み（1つだけ。要件定義書 4.6節）。dimension の値が key のものだけを集計する。
export type AnalyticsFilter = { dimension: Dimension; key: string };

export type AnalyticsState = {
  scopeUserId: string | null; // null＝全体
  includeJoint: boolean;
  month: string; // 円グラフで表示する月
  chart: ChartType;
  split: Dimension; // 円グラフの「分ける」
  filter: AnalyticsFilter | null; // 円グラフ・推移グラフ共通の「絞り込み」。null＝なし（総支出）
  trendMonth: string | null; // 推移グラフで選択中の月。null＝未選択
};

// 絞り込みを、集計・一覧の絞り込みで使う条件の形にする
export function filterConditions(filter: AnalyticsFilter | null): Conditions {
  return filter ? { [filter.dimension]: filter.key } : {};
}

type StateSource = Pick<AnalyticsData, "members" | "months" | "payeeNames"> & DimensionMaster;

// 絞り込みの値が選択肢にあるときだけ絞り込みにする（なければ絞り込みなし）
function validFilter(
  dimension: string | null | undefined,
  key: string | null | undefined,
  data: StateSource
): AnalyticsFilter | null {
  if (!isDimension(dimension) || key === null || key === undefined) return null;
  return dimensionOptions(dimension, data).some((o) => o.key === key)
    ? { dimension, key }
    : null;
}

// URLの値を検証して状態に変換する。不正な値は初期値
// （全体・共同オフ・当月・円グラフ・カテゴリで分ける・絞り込みなし・月未選択）に戻す。
// F4 より前の URL（推移グラフのカテゴリ category=ID）は、カテゴリの絞り込みとして読む。
export function parseAnalyticsState(
  get: (key: string) => string | null | undefined,
  data: StateSource
): AnalyticsState {
  const scope = get("scope");
  const scopeUserId = data.members.some((m) => m.userId === scope) ? scope! : null;
  const month = get("month");
  const trendMonth = get("trendMonth");
  const split = get("split");
  const filter =
    get("filter") === null || get("filter") === undefined
      ? validFilter("category", get("category"), data)
      : validFilter(get("filter"), get("filterValue"), data);
  return {
    scopeUserId,
    includeJoint: scopeUserId !== null && get("joint") === "1",
    month: month && data.months.includes(month) ? month : data.months[data.months.length - 1],
    chart: get("chart") === "trend" ? "trend" : "pie",
    split: isDimension(split) ? split : "category",
    filter,
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
  params.set("split", state.split);
  params.set("filter", state.filter?.dimension ?? "none");
  if (state.filter) {
    params.set("filterValue", state.filter.key);
  }
  if (state.trendMonth !== null) {
    params.set("trendMonth", state.trendMonth);
  }
  return params;
}
