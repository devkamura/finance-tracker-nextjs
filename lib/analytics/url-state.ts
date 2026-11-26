// 分析画面の状態とURLの対応（docs/全体仕様書/基本設計書.md 2.2節・5.5節）。
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
  // 特別費を含めるか（Issue #41）。初期値は false（特別費を除く）。
  // 絞り込み・分けるで特別費の項目を選んでいる間は、この値に関係なく含める（isSpecialExpenseForced）。
  includeSpecialExpense: boolean;
  // 投資を含めるか（Issue #49）。初期値は false（カテゴリ「投資」の明細を除く）。
  // 絞り込みで投資のカテゴリ・内訳を選んでいる間は、この値に関係なく含める（isInvestmentForced）。
  includeInvestment: boolean;
};

// 絞り込みを、集計・一覧の絞り込みで使う条件の形にする
export function filterConditions(filter: AnalyticsFilter | null): Conditions {
  return filter ? { [filter.dimension]: filter.key } : {};
}

// 特別費の項目を絞り込み・分けるで選んでいるか。選んでいる間は「特別費を含める」を ON とみなす
// （OFF のままだと「絞り込み：特別費」が0円になってしまうため。Issue #41）。
// 推移グラフは「分ける」を使わないため、split に null を渡す（絞り込みだけで判定する）。
export function isSpecialExpenseForced(
  filter: AnalyticsFilter | null,
  split: Dimension | null
): boolean {
  return filter?.dimension === "specialExpense" || split === "specialExpense";
}

// 投資のカテゴリ・内訳を絞り込みで選んでいるか。選んでいる間は「投資を含める」を ON とみなす
// （OFF のままだと「絞り込み：カテゴリ＝投資」が0円になってしまうため。Issue #49）。
// 「分ける」は値ごとに分けるだけなので、投資を除いても0円にはならず、強制 ON にしない。
export function isInvestmentForced(
  filter: AnalyticsFilter | null,
  investmentCategoryId: string | null,
  breakdowns: { id: number; categoryId: number }[]
): boolean {
  if (filter === null || investmentCategoryId === null) return false;
  if (filter.dimension === "category") return filter.key === investmentCategoryId;
  if (filter.dimension === "breakdown") {
    return breakdowns.some(
      (b) => String(b.id) === filter.key && String(b.categoryId) === investmentCategoryId
    );
  }
  return false;
}

// 集計・一覧への絞り込みに使う条件。利用者が選んだ絞り込みに、
// 特別費を除くとき（含めない かつ 強制 ON でない）だけ「通常の明細のみ」の条件を足す（Issue #41）。
// excludeCategoryId を渡すと、そのカテゴリの明細を除く条件も足す（投資を除くとき。Issue #49）。
// 投資を含める・強制 ON のときは、呼び出し側で null を渡す。
export function analysisConditions(
  filter: AnalyticsFilter | null,
  split: Dimension | null,
  includeSpecialExpense: boolean,
  excludeCategoryId: string | null = null
): Conditions {
  const conditions = filterConditions(filter);
  const withSpecial: Conditions =
    includeSpecialExpense || isSpecialExpenseForced(filter, split)
      ? conditions
      : { ...conditions, specialExpense: "normal" };
  return excludeCategoryId === null
    ? withSpecial
    : { ...withSpecial, excludeCategory: excludeCategoryId };
}

type StateSource = Pick<AnalyticsData, "members" | "months"> & DimensionMaster;

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
// （全体・共同オフ・当月・円グラフ・カテゴリで分ける・絞り込みなし・月未選択・特別費を除く・投資を除く）に戻す。
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
    includeSpecialExpense: get("special") === "1",
    includeInvestment: get("investment") === "1",
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
  if (state.includeSpecialExpense) {
    params.set("special", "1");
  }
  if (state.includeInvestment) {
    params.set("investment", "1");
  }
  return params;
}
