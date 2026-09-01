import type { SupabaseClient } from "@supabase/supabase-js";

export type Membership = {
  groupId: string;
  role: "admin" | "member";
};

// グループ名を取得する。ヘッダー表示用。
export async function getGroupName(
  supabase: SupabaseClient,
  groupId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();
  return data?.name ?? null;
}

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

export type GroupMember = {
  userId: string;
  role: "admin" | "member";
  displayName: string;
  color: string | null;
};

// グループに所属する（招待中=user_idが未確定のものを除く）メンバー一覧を取得する。
// レシートの支払者表示・帰属先選択（共同/A/B）や精算計算の対象ユーザー特定に使う。
//
// group_membersとprofilesは共にauth.usersを参照しているだけで互いに直接のFKを
// 持たないため、PostgRESTのネスト選択(embedding)では結合できない。
// 2クエリに分けてアプリ側でuser_idをキーに突き合わせる。
export async function getGroupMembers(
  supabase: SupabaseClient,
  groupId: string
): Promise<GroupMember[]> {
  const { data: memberRows } = await supabase
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", groupId)
    .not("user_id", "is", null)
    .order("role", { ascending: true });

  const userIds = (memberRows ?? []).map((row) => row.user_id as string);
  if (userIds.length === 0) {
    return [];
  }

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name, color")
    .in("id", userIds);

  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  return (memberRows ?? []).map((row) => {
    const profile = profileById.get(row.user_id as string);
    return {
      userId: row.user_id as string,
      role: row.role as "admin" | "member",
      displayName: profile?.display_name ?? "unknown",
      color: profile?.color ?? null,
    };
  });
}
