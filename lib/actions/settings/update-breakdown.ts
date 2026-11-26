"use server";

import {
  isCostType,
  toBreakdownCostType,
  type CategoryBreakdown,
  type CostType,
} from "@/lib/receipts/breakdowns";
import { requireGroupAdmin } from "@/lib/settings/admin";

export type UpdateBreakdownResult =
  | { success: true; breakdown: CategoryBreakdown }
  | { success: false; error: string };

// 内訳の名前の変更、表示・非表示の切り替え、費用区分の変更（管理者のみ）。
// 使われている内訳は削除できないため、選択肢から外したいときは非表示にする（基本設計書 Q4）。
// 費用区分は内訳ごとに固定費・変動費のどちらかを持つ（Issue #49。カテゴリに合わせて変わる仕組みはない）。
export async function updateBreakdown(
  id: number,
  patch: { name?: string; isHidden?: boolean; costType?: CostType }
): Promise<UpdateBreakdownResult> {
  const values: { name?: string; is_hidden?: boolean; cost_type?: CostType } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      return { success: false, error: "内訳名を入力してください。" };
    }
    values.name = trimmed;
  }
  if (patch.isHidden !== undefined) {
    values.is_hidden = patch.isHidden;
  }
  if (patch.costType !== undefined) {
    if (!isCostType(patch.costType)) {
      return { success: false, error: "費用区分が不正です。" };
    }
    values.cost_type = patch.costType;
  }

  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { data, error } = await supabase
    .from("category_breakdowns")
    .update(values)
    .eq("id", id)
    .eq("group_id", groupId)
    .select("id, category_id, name, is_hidden, cost_type")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "同じ名前の内訳が既に存在します。" };
    }
    console.error("Failed to update breakdown", error);
    return { success: false, error: "内訳の更新に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return {
    success: true,
    breakdown: {
      id: data.id,
      categoryId: data.category_id,
      name: data.name,
      isHidden: data.is_hidden,
      costType: toBreakdownCostType(data.cost_type),
    },
  };
}
