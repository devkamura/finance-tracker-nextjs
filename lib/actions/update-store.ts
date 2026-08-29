"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdateStoreResult =
  | { success: true; store: { id: number; name: string } }
  | { success: false; error: string };

// RLS(admin can write own group stores)が対象を自グループの店舗に限定するため、
// 他グループの店舗IDを指定した場合は更新0件になり「権限がありません」を返す。
export async function updateStore(
  id: number,
  name: string
): Promise<UpdateStoreResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "店舗名を入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { data, error } = await supabase
    .from("stores")
    .update({ name: trimmed })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "同じ名前の店舗が既に存在します。" };
    }
    console.error("Failed to update store", error);
    return { success: false, error: "店舗の更新に失敗しました。" };
  }

  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return { success: true, store: data };
}
