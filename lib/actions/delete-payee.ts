"use server";

import { createClient } from "@/lib/supabase/server";

export type DeletePayeeResult =
  | { success: true }
  | { success: false; error: string };

export async function deletePayee(id: number): Promise<DeletePayeeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { data, error } = await supabase
    .from("payees")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to delete payee", error);
    return { success: false, error: "支払い先の削除に失敗しました。" };
  }

  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return { success: true };
}
