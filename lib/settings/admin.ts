import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = { supabase: SupabaseClient; groupId: string };

// 設定画面の管理者専用の操作で使う、ログイン・グループ所属・管理者の確認。
// 画面でも編集ボタンを出し分けるが、最終的な防御はDBのRLS（is_group_admin）が担う。
export async function requireGroupAdmin(): Promise<
  { ok: true; context: AdminContext } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインが必要です。" };
  }
  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership || membership.role !== "admin") {
    return { ok: false, error: "管理者のみ編集できます。" };
  }
  return { ok: true, context: { supabase, groupId: membership.groupId } };
}

// 設定画面のうち、グループのメンバー全員が編集できる操作（タグ）で使う、ログイン・グループ所属の確認。
// 最終的な防御はDBのRLS（my_group_ids）が担う。
export async function requireGroupMember(): Promise<
  { ok: true; context: AdminContext } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインが必要です。" };
  }
  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) {
    return { ok: false, error: "グループに所属していません。" };
  }
  return { ok: true, context: { supabase, groupId: membership.groupId } };
}
