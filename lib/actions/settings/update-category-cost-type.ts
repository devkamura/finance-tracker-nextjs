"use server";

import type { CostType } from "@/lib/receipts/breakdowns";
import { requireGroupAdmin } from "@/lib/settings/admin";

export type UpdateCategoryCostTypeResult =
  | { success: true }
  | { success: false; error: string };

// カテゴリの費用区分（固定費／変動費）をグループの設定として保存する（管理者のみ）。
// 分析では集計時点の費用区分を使うため、過去の月の集計も新しい区分で表示される（基本設計書 Q6）。
export async function updateCategoryCostType(
  categoryId: number,
  costType: CostType
): Promise<UpdateCategoryCostTypeResult> {
  if (costType !== "fixed" && costType !== "variable") {
    return { success: false, error: "不正な費用区分です。" };
  }

  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { error } = await supabase
    .from("category_settings")
    .upsert(
      { group_id: groupId, category_id: categoryId, cost_type: costType },
      { onConflict: "group_id,category_id" }
    );

  if (error) {
    console.error("Failed to update category cost type", error);
    return { success: false, error: "費用区分の更新に失敗しました。" };
  }
  return { success: true };
}
