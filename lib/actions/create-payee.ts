"use server";

import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export type CreatePayeeResult =
  | { success: true; payee: { id: number; name: string } }
  | { success: false; error: string };

export async function createPayee(name: string): Promise<CreatePayeeResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "支払い先名を入力してください。" };
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
    .from("payees")
    .insert({ group_id: membership.groupId, name: trimmed })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "同じ名前の支払い先が既に存在します。" };
    }
    console.error("Failed to create payee", error);
    return { success: false, error: "支払い先の登録に失敗しました。" };
  }

  return { success: true, payee: data };
}
