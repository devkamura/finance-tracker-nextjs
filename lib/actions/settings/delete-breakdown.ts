"use server";

import { requireGroupAdmin } from "@/lib/settings/admin";

export type DeleteBreakdownResult =
  | { success: true }
  | { success: false; error: string };

// 内訳を削除する（管理者のみ）。登録済みの明細で使われている内訳は、DBの外部キー
// （on delete restrict）で削除できないため、非表示を案内する（基本設計書 Q4）。
export async function deleteBreakdown(id: number): Promise<DeleteBreakdownResult> {
  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { data, error } = await supabase
    .from("category_breakdowns")
    .delete()
    .eq("id", id)
    .eq("group_id", groupId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error: "この内訳は登録済みの明細で使われているため削除できません。非表示にしてください。",
      };
    }
    console.error("Failed to delete breakdown", error);
    return { success: false, error: "内訳の削除に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "権限がありません。" };
  }
  return { success: true };
}
