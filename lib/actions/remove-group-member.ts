"use server";

import { createClient } from "@/lib/supabase/server";

export type RemoveGroupMemberResult =
  | { success: true }
  | { success: false; error: string };

// group_members.idを指定してグループから除籍する（対象のGoogleアカウント自体は削除しない）。
// RLS(admin can remove non-admin group members)が「自グループかつ管理者以外」に
// 対象を限定するため、条件を満たさない場合は削除0件になり「権限がありません」を返す。
export async function removeGroupMember(
  memberId: string
): Promise<RemoveGroupMemberResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { data, error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", memberId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to remove group member", error);
    return { success: false, error: "メンバーの削除に失敗しました。" };
  }

  if (!data) {
    return { success: false, error: "権限がありません。" };
  }

  return { success: true };
}
