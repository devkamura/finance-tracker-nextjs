// カテゴリの内訳（docs/分析拡充/基本設計書.md 3.1節）。
// 登録画面（クライアント）と Server Action の入力チェックの両方から使うため server-only にはしない。

export type CategoryBreakdown = {
  id: number;
  categoryId: number;
  name: string;
  // 使われている内訳は削除できないため、選択肢から外したいときは非表示にする
  isHidden: boolean;
};

export type CostType = "fixed" | "variable";

export const COST_TYPE_LABELS: Record<CostType, string> = {
  fixed: "固定費",
  variable: "変動費",
};

// カテゴリの選択肢に出す（非表示でない）内訳。categoryIdはフォームの文字列値も受け付ける。
export function visibleBreakdownsFor(
  categoryId: string | number,
  breakdowns: CategoryBreakdown[]
): CategoryBreakdown[] {
  return breakdowns.filter((b) => String(b.categoryId) === String(categoryId) && !b.isHidden);
}

// 内訳が必須か。表示中の内訳が1つ以上あるカテゴリでは必須（内訳がないカテゴリは欄を出さない）。
export function isBreakdownRequired(
  categoryId: string | number,
  breakdowns: CategoryBreakdown[]
): boolean {
  return categoryId !== "" && visibleBreakdownsFor(categoryId, breakdowns).length > 0;
}

// カテゴリを選んだときに自動で入れる内訳。表示中の内訳が1つだけならそれを選び、それ以外は空。
export function autoBreakdownIdFor(
  categoryId: string | number,
  breakdowns: CategoryBreakdown[]
): string {
  const visible = visibleBreakdownsFor(categoryId, breakdowns);
  return visible.length === 1 ? String(visible[0].id) : "";
}

// 明細の内訳が、そのカテゴリの内訳として正しいか（非表示の内訳も、既存の値としては正しい）。
export function isBreakdownOfCategory(
  breakdownId: string,
  categoryId: string,
  breakdowns: CategoryBreakdown[]
): boolean {
  return breakdowns.some(
    (b) => String(b.id) === breakdownId && String(b.categoryId) === categoryId
  );
}

// 一括入力を適用したあとの内訳。カテゴリを指定したときは、内訳の指定があればそれを使い、
// なければ（「各項目で選ぶ」）同じカテゴリでも各項目で選び直す（内訳が1つだけなら自動で選ぶ）。
// カテゴリを指定しないときは今の内訳のまま。
export function breakdownIdAfterBulkApply(
  currentBreakdownId: string,
  bulkCategoryId: string | undefined,
  bulkBreakdownId: string | undefined,
  breakdowns: CategoryBreakdown[]
): string {
  if (bulkCategoryId === undefined) return currentBreakdownId;
  return bulkBreakdownId ?? autoBreakdownIdFor(bulkCategoryId, breakdowns);
}
