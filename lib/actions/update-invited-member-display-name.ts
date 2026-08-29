"use server";

import { createClient } from "@/lib/supabase/server";

export type UpdateInvitedMemberDisplayNameResult =
  | { success: true; displayName: string }
  | { success: false; error: string };

// 管理者が「招待中(未参加)」のユーザーのユーザー名を先に登録・編集する。
// 対象ユーザーが実際にログインしてグループに紐付いた時点で、
// この値がprofiles.display_nameへ引き継がれる（_link_group_membership参照）。
// RLS(admin can update invited member display name)が「自グループかつ未参加」に
// 対象を限定するため、更新0件の場合は「権限がない、または対象が存在しない」ものとして扱う。
export async function updateInvitedMemberDisplayName(
  memberId: string,
  displayName: string
): Promise<UpdateInvitedMemberDisplayNameResult> {
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
    .from("group_members")
    .update({ invited_display_name: trimmed })
    .eq("id", memberId)
    .select("invited_display_name")
    .maybeSingle();

  if (error) {
    console.error("Failed to update invited member display name", error);
    return { success: false, error: "表示名の更新に失敗しました。" };
  }

  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return { success: true, displayName: data.invited_display_name ?? "" };
}
