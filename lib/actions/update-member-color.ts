"use server";

import { USER_COLORS } from "@/lib/user-colors";
import { createClient } from "@/lib/supabase/server";

export type UpdateMemberColorResult =
  | { success: true; color: string | null }
  | { success: false; error: string };

// 管理者が自グループのメンバー（管理者自身を含む）の表示色を更新する。
// RLS(admin can update managed profiles)が実質的なアクセス制御を担うため、
// 更新0件の場合は「権限がない、または対象が存在しない」ものとして扱う。
// display_nameと同じ管理者限定ポリシーを流用する（update-member-display-name.tsと同じ思想）。
export async function updateMemberColor(
  userId: string,
  color: string | null
): Promise<UpdateMemberColorResult> {
  if (color !== null && !(USER_COLORS as readonly string[]).includes(color)) {
    return { success: false, error: "不正な色が指定されました。" };
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
    .update({ color })
    .eq("id", userId)
    .select("color")
    .maybeSingle();

  if (error) {
    console.error("Failed to update member color", error);
    return { success: false, error: "色の更新に失敗しました。" };
  }

  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return { success: true, color: data.color };
}
