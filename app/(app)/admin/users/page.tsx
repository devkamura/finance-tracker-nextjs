import { InviteMemberForm } from "@/components/admin/InviteMemberForm";
import { MemberList, type MemberView } from "@/components/admin/MemberList";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const { data: members, error } = await supabase
    .from("group_members")
    .select("id, user_id, invited_email, invited_display_name, role")
    .eq("group_id", membership!.groupId)
    .order("created_at");
  if (error) {
    throw error;
  }

  // group_membersとprofilesの間に直接の外部キーがないため、
  // PostgRESTのネストselectは使わず2回に分けて取得しJS側でマージする。
  const userIds = members
    .filter((m) => m.user_id !== null)
    .map((m) => m.user_id as string);

  const { data: profiles } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email, color")
          .in("id", userIds)
      : {
          data: [] as {
            id: string;
            display_name: string;
            email: string | null;
            color: string | null;
          }[],
        };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const memberViews: MemberView[] = members.map((m) => {
    const profile = m.user_id ? profileMap.get(m.user_id) : undefined;
    return {
      id: m.id,
      userId: m.user_id,
      role: m.role as "admin" | "member",
      // 参加済みメンバーはprofiles.email（ログイン済みGoogleアカウントのメール）、
      // 招待中メンバーはgroup_members.invited_emailを表示する。
      email: profile ? (profile.email ?? null) : m.invited_email,
      displayName: profile
        ? (profile.display_name ?? null)
        : m.invited_display_name,
      color: profile?.color ?? null,
      joined: m.user_id !== null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">ユーザー管理</h1>
      <InviteMemberForm memberCount={members.length} />
      <MemberList members={memberViews} />
    </div>
  );
}
