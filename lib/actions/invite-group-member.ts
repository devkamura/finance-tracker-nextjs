"use server";

import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail, validateEmail } from "@/lib/validation/email-rules";

export type InviteGroupMemberResult =
  | { success: true }
  | { success: false; error: string };

export async function inviteGroupMember(
  email: string
): Promise<InviteGroupMemberResult> {
  const errors = validateEmail(email);
  if (errors.length > 0) {
    return { success: false, error: errors[0] };
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

  // 要件定義書2.1/2.3章：1グループにつき管理者含め最大2人。
  // 同時実行時の最終防波堤はDBトリガー(group_members_limit_check)が担う。
  const { count } = await supabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", membership.groupId);
  if ((count ?? 0) >= 2) {
    return {
      success: false,
      error: "グループの登録人数上限（管理者含め2人）に達しています。",
    };
  }

  const { error } = await supabase.from("group_members").insert({
    group_id: membership.groupId,
    invited_email: normalizeEmail(email),
    role: "member",
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "既に追加済みのメールアドレスです。" };
    }
    if (error.message?.includes("group member limit")) {
      return {
        success: false,
        error: "グループの登録人数上限（管理者含め2人）に達しています。",
      };
    }
    console.error("Failed to invite group member", error);
    return { success: false, error: "ユーザーの追加に失敗しました。" };
  }

  return { success: true };
}
