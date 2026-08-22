"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdateDisplayNameResult =
  | { success: true; displayName: string }
  | { success: false; error: string };

export async function updateDisplayName(
  displayName: string
): Promise<UpdateDisplayNameResult> {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return { success: false, error: "表示名を入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update display name", error);
    return { success: false, error: "表示名の更新に失敗しました。" };
  }

  return { success: true, displayName: trimmed };
}
