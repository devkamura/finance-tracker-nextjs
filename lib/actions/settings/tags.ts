"use server";

import type { Tag } from "@/lib/receipts/labels";
import { requireGroupAdmin } from "@/lib/settings/admin";

// 設定 ＞ タグの操作（管理者のみ。docs/分析拡充/基本設計書.md 2.5節・4.2節・Q2）。

export type TagActionResult = { success: true; tag: Tag } | { success: false; error: string };

export type DeleteTagResult = { success: true } | { success: false; error: string };

const DUPLICATE_NAME = "同じ名前のタグが既に存在します。";

function toTag(row: { id: number; name: string; is_hidden: boolean }): Tag {
  return { id: row.id, name: row.name, isHidden: row.is_hidden };
}

// タグを追加する。並び順は末尾にする。
export async function createTag(name: string): Promise<TagActionResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "タグ名を入力してください。" };
  }

  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { data: last } = await supabase
    .from("tags")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("tags")
    .insert({ group_id: groupId, name: trimmed, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id, name, is_hidden")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: DUPLICATE_NAME };
    }
    console.error("Failed to create tag", error);
    return { success: false, error: "タグの登録に失敗しました。" };
  }
  return { success: true, tag: toTag(data) };
}

// タグの名前の変更、または表示・非表示の切り替え。
export async function updateTag(
  id: number,
  patch: { name?: string; isHidden?: boolean }
): Promise<TagActionResult> {
  const values: { name?: string; is_hidden?: boolean } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      return { success: false, error: "タグ名を入力してください。" };
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
    .from("tags")
    .update(values)
    .eq("id", id)
    .eq("group_id", groupId)
    .select("id, name, is_hidden")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: DUPLICATE_NAME };
    }
    console.error("Failed to update tag", error);
    return { success: false, error: "タグの更新に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "権限がありません。" };
  }
  return { success: true, tag: toTag(data) };
}

// タグを削除する。登録済みの明細で使われているタグは、DBの外部キー
// （on delete restrict）で削除できないため、非表示を案内する（基本設計書 Q4）。
export async function deleteTag(id: number): Promise<DeleteTagResult> {
  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { data, error } = await supabase
    .from("tags")
    .delete()
    .eq("id", id)
    .eq("group_id", groupId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error: "このタグは登録済みの明細で使われているため削除できません。非表示にしてください。",
      };
    }
    console.error("Failed to delete tag", error);
    return { success: false, error: "タグの削除に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "権限がありません。" };
  }
  return { success: true };
}
