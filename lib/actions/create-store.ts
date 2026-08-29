"use server";

import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export type CreateStoreResult =
  | { success: true; store: { id: number; name: string } }
  | { success: false; error: string };

export async function createStore(name: string): Promise<CreateStoreResult> {
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

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || membership.role !== "admin") {
    return { success: false, error: "権限がありません。" };
  }

  const { data, error } = await supabase
    .from("stores")
    .insert({ group_id: membership.groupId, name: trimmed })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "同じ名前の店舗が既に存在します。" };
    }
    console.error("Failed to create store", error);
    return { success: false, error: "店舗の登録に失敗しました。" };
  }

  return { success: true, store: data };
}
