"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdateMemberDisplayNameResult =
  | { success: true; displayName: string }
  | { success: false; error: string };

// 管理者が自グループのメンバー（管理者自身を含む）の表示名を更新する。
// RLS(admin can update managed profiles)が実質的なアクセス制御を担うため、
// 更新0件の場合は「権限がない、または対象が存在しない」ものとして扱う。
export async function updateMemberDisplayName(
  userId: string,
  displayName: string
): Promise<UpdateMemberDisplayNameResult> {
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

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", userId)
    .select("display_name")
    .maybeSingle();

  if (error) {
    console.error("Failed to update member display name", error);
    return { success: false, error: "表示名の更新に失敗しました。" };
  }

  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return { success: true, displayName: data.display_name };
}
