import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CategoryBreakdown, CostType } from "@/lib/receipts/breakdowns";

// グループのカテゴリの内訳を取得する（非表示のものも含む。並び順→登録順）。
// 登録画面の選択肢・入力チェック、設定画面の両方で使う。
export async function getCategoryBreakdowns(
  supabase: SupabaseClient,
  groupId: string
): Promise<CategoryBreakdown[]> {
  const { data, error } = await supabase
    .from("category_breakdowns")
    .select("id, category_id, name, is_hidden")
    .eq("group_id", groupId)
    .order("sort_order")
    .order("id");
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    isHidden: row.is_hidden,
  }));
}

export type CategoryWithCostType = {
  id: number;
  name: string;
  costType: CostType;
};

// カテゴリと、グループでの費用区分を取得する。グループで設定していないカテゴリは
// カテゴリの初期値（categories.default_cost_type）を使う（基本設計書 3.2節）。
export async function getCategoriesWithCostType(
  supabase: SupabaseClient,
  groupId: string
): Promise<CategoryWithCostType[]> {
  const [{ data: categories, error: categoriesError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase.from("categories").select("id, name, default_cost_type").order("id"),
      supabase.from("category_settings").select("category_id, cost_type").eq("group_id", groupId),
    ]);
  if (categoriesError) throw categoriesError;
  if (settingsError) throw settingsError;

  const overrides = new Map(
    (settings ?? []).map((s) => [s.category_id as number, s.cost_type as CostType])
  );
  return (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    costType: overrides.get(c.id) ?? (c.default_cost_type as CostType),
  }));
}
