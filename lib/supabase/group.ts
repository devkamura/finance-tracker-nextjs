import type { SupabaseClient } from "@supabase/supabase-js";

export type Membership = {
  groupId: string;
  role: "admin" | "member";
};

// ログインユーザーの所属グループを取得する。
// 現在は「1ユーザー=1グループ」運用のため先頭の1件を採用するが、
// 将来1アカウントが複数グループに所属できるようにする場合は
// この関数だけを「現在選択中グループ」を返すように変更すればよい。
export async function getCurrentMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<Membership | null> {
  const { data } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return { groupId: data.group_id, role: data.role as "admin" | "member" };
}

// 指定グループの管理者のuser_idを取得する。
// レシートのGoogle Driveアップロード先を「投稿者本人」ではなく
// 「グループ管理者」のDriveに一本化するために使う（各メンバーは
// 管理者のDriveへのアクセス権を持たないため、投稿者自身のトークンでは
// アップロードできない）。
export async function getGroupAdminUserId(
  supabase: SupabaseClient,
  groupId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("role", "admin")
    .maybeSingle();

  return data?.user_id ?? null;
}
