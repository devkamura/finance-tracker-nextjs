"use server";

import { requireGroupAdmin } from "@/lib/settings/admin";

// 設定 ＞ 相手の操作（管理者のみ。docs/分析拡充/基本設計書.md 2.4節・4.2節）。
// メンバー・既定の相手（ふたり・友人・実家）は表示・非表示の切り替えだけができ、
// 任意の相手は追加・名前の変更・削除もできる。

export type CounterpartActionResult =
  | { success: true; counterpart: { id: number; name: string | null; isHidden: boolean } }
  | { success: false; error: string };

export type DeleteCounterpartResult = { success: true } | { success: false; error: string };

const DUPLICATE_NAME = "同じ名前の相手が既に存在します。";

// 任意の相手を追加する。並び順は末尾にする。
export async function createCounterpart(name: string): Promise<CounterpartActionResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "相手の名前を入力してください。" };
  }

  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { data: last } = await supabase
    .from("counterparts")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("counterparts")
    .insert({
      group_id: groupId,
      kind: "custom",
      name: trimmed,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id, name, is_hidden")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: DUPLICATE_NAME };
    }
    console.error("Failed to create counterpart", error);
    return { success: false, error: "相手の登録に失敗しました。" };
  }
  return {
    success: true,
    counterpart: { id: data.id, name: data.name, isHidden: data.is_hidden },
  };
}

// 相手の名前の変更（任意の相手のみ）、または表示・非表示の切り替え。
export async function updateCounterpart(
  id: number,
  patch: { name?: string; isHidden?: boolean }
): Promise<CounterpartActionResult> {
  const values: { name?: string; is_hidden?: boolean } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      return { success: false, error: "相手の名前を入力してください。" };
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

  let query = supabase.from("counterparts").update(values).eq("id", id).eq("group_id", groupId);
  // 名前を変えられるのは任意の相手だけ（DBのトリガーでも防ぐ）
  if (values.name !== undefined) {
    query = query.eq("kind", "custom");
  }
  const { data, error } = await query.select("id, name, is_hidden").maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: DUPLICATE_NAME };
    }
    console.error("Failed to update counterpart", error);
    return { success: false, error: "相手の更新に失敗しました。" };
  }
  if (!data) {
    return {
      success: false,
      error:
        values.name !== undefined
          ? "メンバー・既定の相手の名前は変更できません。"
          : "権限がありません。",
    };
  }
  return {
    success: true,
    counterpart: { id: data.id, name: data.name, isHidden: data.is_hidden },
  };
}

// 任意の相手を削除する。登録済みの明細で使われている相手は、DBの外部キー
// （on delete restrict）で削除できないため、非表示を案内する（基本設計書 Q4）。
export async function deleteCounterpart(id: number): Promise<DeleteCounterpartResult> {
  const auth = await requireGroupAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase, groupId } = auth.context;

  const { data, error } = await supabase
    .from("counterparts")
    .delete()
    .eq("id", id)
    .eq("group_id", groupId)
    .eq("kind", "custom")
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error: "この相手は登録済みの明細で使われているため削除できません。非表示にしてください。",
      };
    }
    console.error("Failed to delete counterpart", error);
    return { success: false, error: "相手の削除に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "メンバー・既定の相手は削除できません。" };
  }
  return { success: true };
}
