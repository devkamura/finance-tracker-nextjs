// レシート一覧のURLパラメータ（docs/支出分析機能/詳細設計書.md フェーズ3 2章・5.4節）。
// 一覧 → 詳細 → 編集 → 詳細 → 一覧 と移動しても、月・並び順・絞り込みの条件が
// 保たれるよう、引き継ぐパラメータをここで一元管理する。
// 分析画面（Client Component）からも使うため server-only にはしない。

import type { Scope } from "@/lib/analytics/types";

// 一覧の状態として引き継ぐパラメータ（openは行を開く一時的な指定のため含めない）
export const LIST_PARAM_KEYS = ["month", "sort", "category", "scope", "joint", "from"] as const;

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
export function buildFilteredListHref(input: {
  month: string;
  categoryId: number | null;
  scope: Scope;
  from: DrilldownSource;
}): string {
  const params = new URLSearchParams();
  params.set("month", input.month);
  if (input.categoryId !== null) params.set("category", String(input.categoryId));
  params.set("scope", input.scope.kind === "all" ? "all" : input.scope.userId);
  if (input.scope.kind === "user" && input.scope.includeJoint) params.set("joint", "1");
  params.set("from", input.from);
  return `/receipts?${params.toString()}`;
}

export type ReceiptListFilter = {
  categoryId: number | null;
  categoryName: string | null; // null＝総支出（全カテゴリ）
  scope: Scope;
  scopeLabel: string; // 「全体」「A」「A＋共同1/2」
};

// 一覧のURLパラメータから絞り込み条件を読み取る。絞り込みがなければnull。
// 分析画面からのリンクは必ず scope を付けるため、scope（all／ユーザーID）または
// category があるときを「絞り込み中」とする（総支出・全体での絞り込みもありうるため）。
// 存在しないカテゴリ・グループ外のユーザーは無視する（その条件では絞らない）。
export function parseListFilter(
  searchParams: RawSearchParams,
  categories: { id: number; name: string }[],
  members: { userId: string; displayName: string }[]
): ReceiptListFilter | null {
  const get = (key: ListParamKey) => firstValue(searchParams[key]);

  const category = categories.find((c) => String(c.id) === get("category")) ?? null;
  const member = members.find((m) => m.userId === get("scope")) ?? null;

  if (!category && !member && get("scope") !== "all") {
    return null;
  }

  const includeJoint = member !== null && get("joint") === "1";
  return {
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
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
