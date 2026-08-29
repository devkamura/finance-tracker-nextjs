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
