"use server";

import type { CategoryBreakdown } from "@/lib/receipts/breakdowns";
import { requireGroupAdmin } from "@/lib/settings/admin";

export type UpdateBreakdownResult =
  | { success: true; breakdown: CategoryBreakdown }
  | { success: false; error: string };

// 内訳の名前の変更、または表示・非表示の切り替え（管理者のみ）。
// 使われている内訳は削除できないため、選択肢から外したいときは非表示にする（基本設計書 Q4）。
export async function updateBreakdown(
  id: number,
  patch: { name?: string; isHidden?: boolean }
): Promise<UpdateBreakdownResult> {
  const values: { name?: string; is_hidden?: boolean } = {};
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
    .select("id, category_id, name, is_hidden")
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
    },
  };
}
