"use server";

import type { CategoryBreakdown } from "@/lib/receipts/breakdowns";
import { requireGroupAdmin } from "@/lib/settings/admin";

export type CreateBreakdownResult =
  | { success: true; breakdown: CategoryBreakdown }
  | { success: false; error: string };

// カテゴリに内訳を追加する（管理者のみ。docs/分析拡充/基本設計書.md 2.3節）。
// 並び順はそのカテゴリの末尾にする。
export async function createBreakdown(
  categoryId: number,
  name: string
): Promise<CreateBreakdownResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "内訳名を入力してください。" };
  }

  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { data: last } = await supabase
    .from("category_breakdowns")
    .select("sort_order")
    .eq("group_id", groupId)
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("category_breakdowns")
    .insert({
      group_id: groupId,
      category_id: categoryId,
      name: trimmed,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id, category_id, name, is_hidden")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "同じ名前の内訳が既に存在します。" };
    }
    console.error("Failed to create breakdown", error);
    return { success: false, error: "内訳の登録に失敗しました。" };
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
