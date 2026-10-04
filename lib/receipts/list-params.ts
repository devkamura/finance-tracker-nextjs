// レシート一覧のURLパラメータ（docs/支出分析機能/詳細設計書.md フェーズ3 2章・5.4節）。
// 一覧 → 詳細 → 編集 → 詳細 → 一覧 と移動しても、月・並び順・絞り込みの条件が
// 保たれるよう、引き継ぐパラメータをここで一元管理する。
// 分析画面（Client Component）からも使うため server-only にはしない。

import {
  conditionsLabel,
  DIMENSIONS,
  NO_BREAKDOWN_KEY,
  type Conditions,
  type Dimension,
  type DimensionMaster,
} from "@/lib/analytics/dimensions";
import { UNREGISTERED_PAYEE_KEY } from "@/lib/analytics/payees";
import type { Scope } from "@/lib/analytics/types";

// 一覧の状態として引き継ぐパラメータ（openは行を開く一時的な指定のため含めない）。
// ret は「← 分析に戻る」で開く分析画面の状態（詳細・編集と行き来しても失わないよう引き継ぐ）。
// 絞り込みの条件（category〜counterpart）は、分析の「分ける」「絞り込み」の項目と同じ名前
// （docs/分析拡充/詳細設計書.md F4 4章）。
export const LIST_PARAM_KEYS = [
  "month",
  "sort",
  ...DIMENSIONS,
  "scope",
  "joint",
  "from",
  "ret",
] as const;

// ret に入れてよい分析画面の状態の項目（lib/analytics/url-state.ts と対応）
const ANALYTICS_STATE_KEYS = [
  "scope",
  "joint",
  "month",
  "chart",
  "split",
  "filter",
  "filterValue",
  "trendMonth",
] as const;

type ListParamKey = (typeof LIST_PARAM_KEYS)[number];

// 絞り込み一覧への移動元。予算進捗（フェーズ5）からの移動もここに追加する。
export type DrilldownSource = "analytics";

type RawSearchParams = Partial<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// searchParamsから、一覧の状態として引き継ぐパラメータだけを取り出す。
export function pickListParams(searchParams: RawSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of LIST_PARAM_KEYS) {
    const value = firstValue(searchParams[key]);
    if (value) params.set(key, value);
  }
  return params;
}

// クエリ文字列を付けたパスを返す（パラメータがなければパスのみ）。
export function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

// 分析画面などから、絞り込んだレシート一覧へのURLを作る。
// returnState には移動元の分析画面の状態（serializeAnalyticsStateの結果）を渡し、
// 一覧の「← 分析に戻る」でその状態の分析画面を開けるようにする。
// conditions には、絞り込みの条件と、円グラフの行（「分ける」項目の値）を合わせて渡す。
export function buildFilteredListHref(input: {
  month: string;
  conditions: Conditions;
  scope: Scope;
  from: DrilldownSource;
  returnState?: URLSearchParams;
}): string {
  const params = new URLSearchParams();
  params.set("month", input.month);
  for (const dimension of DIMENSIONS) {
    const value = input.conditions[dimension];
    if (value !== undefined) params.set(dimension, value);
  }
  params.set("scope", input.scope.kind === "all" ? "all" : input.scope.userId);
  if (input.scope.kind === "user" && input.scope.includeJoint) params.set("joint", "1");
  params.set("from", input.from);
  if (input.returnState) params.set("ret", input.returnState.toString());
  return `/receipts?${params.toString()}`;
}

// 「← 分析に戻る」のURLを作る。
// ret の値をそのまま行き先にすると、外部サイトへ飛ばされる危険（オープンリダイレクト）があるため、
// 行き先は常に /analytics に固定し、ret からは分析画面の状態の項目だけを取り出して付ける。
// 各項目の値の妥当性は分析画面側（parseAnalyticsState）で検証される。
export function buildAnalyticsReturnHref(ret: string | null | undefined): string {
  const source = new URLSearchParams(ret ?? "");
  const params = new URLSearchParams();
  for (const key of ANALYTICS_STATE_KEYS) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  return withQuery("/analytics", params);
}

export type ReceiptListFilter = {
  conditions: Conditions; // 条件なし＝総支出
  label: string | null; // 条件の表示名（「食費 ＞ 外食」など）。null＝総支出
  scope: Scope;
  scopeLabel: string; // 「全体」「A」「A＋共同1/2」
};

// URLの条件の値が正しいか。存在しないカテゴリ・内訳・相手・支払い先、不正な費用区分は無視する。
// 支払い先は登録済みの支払い先のID（相方の自分用・非表示を含む）か、登録外（手入力）。
function isValidConditionValue(
  dimension: Dimension,
  value: string,
  master: DimensionMaster
): boolean {
  switch (dimension) {
    case "category":
      return master.categories.some((c) => String(c.id) === value);
    case "breakdown":
      return value === NO_BREAKDOWN_KEY || master.breakdowns.some((b) => String(b.id) === value);
    case "costType":
      return value === "fixed" || value === "variable";
    case "payee":
      return value === UNREGISTERED_PAYEE_KEY || master.payees.some((p) => String(p.id) === value);
    case "counterpart":
      return master.counterparts.some((c) => String(c.id) === value);
  }
}

// 一覧のURLパラメータから絞り込み条件を読み取る。絞り込みがなければnull。
// 分析画面からのリンクは必ず scope を付けるため、scope（all／ユーザーID）または
// 条件（カテゴリ・内訳・費用区分・支払い先・相手）があるときを「絞り込み中」とする
// （総支出・全体での絞り込みもありうるため）。
// 不正な条件・グループ外のユーザーは無視する（その条件では絞らない）。
export function parseListFilter(
  searchParams: RawSearchParams,
  master: DimensionMaster,
  members: { userId: string; displayName: string }[]
): ReceiptListFilter | null {
  const get = (key: ListParamKey) => firstValue(searchParams[key]);

  const conditions: Conditions = {};
  for (const dimension of DIMENSIONS) {
    const value = get(dimension);
    if (!value) continue;
    if (isValidConditionValue(dimension, value, master)) conditions[dimension] = value;
  }
  const member = members.find((m) => m.userId === get("scope")) ?? null;

  if (Object.keys(conditions).length === 0 && !member && get("scope") !== "all") {
    return null;
  }

  const includeJoint = member !== null && get("joint") === "1";
  return {
    conditions,
    label: conditionsLabel(conditions, master),
    scope: member
      ? { kind: "user", userId: member.userId, includeJoint }
      : { kind: "all" },
    scopeLabel: member
      ? `${member.displayName}${includeJoint ? "＋共同1/2" : ""}`
      : "全体",
  };
}

// 絞り込み一覧への移動元を読み取る。絞り込みを解除しても残る（「← 分析に戻る」を出し続けるため）。
export function parseDrilldownSource(searchParams: RawSearchParams): DrilldownSource | null {
  return firstValue(searchParams.from) === "analytics" ? "analytics" : null;
}
