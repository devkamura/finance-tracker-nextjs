"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdatePayeeResult =
  | { success: true; payee: { id: number; name: string } }
  | { success: false; error: string };

// RLS(admin can write own group payees)が対象を自グループの支払い先に限定するため、
// 他グループの支払い先IDを指定した場合は更新0件になり「権限がありません」を返す。
export async function updatePayee(
  id: number,
  name: string
): Promise<UpdatePayeeResult> {
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

  const { data, error } = await supabase
    .from("payees")
    .update({ name: trimmed })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "同じ名前の支払い先が既に存在します。" };
    }
    console.error("Failed to update payee", error);
    return { success: false, error: "支払い先の更新に失敗しました。" };
  }

  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return { success: true, payee: data };
}
