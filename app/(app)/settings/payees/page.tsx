import { PayeeSettingsManager } from "@/components/settings/PayeeSettingsManager";
import {
  getCategoriesWithCostType,
  getCategoryBreakdowns,
  getCounterparts,
  getPayees,
  getTags,
} from "@/lib/settings/queries";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 設定 ＞ 支払い先（docs/分析拡充/基本設計書.md 2.6節）。管理画面の「支払い先管理」から移設した。
// グループ全体は管理者のみ、自分用は本人のみ編集できる。相方用は閲覧のみ。
export default async function PayeeSettingsPage() {
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);
  const groupId = membership!.groupId;

  const [payees, categories, breakdowns, tags, members] = await Promise.all([
    getPayees(supabase, groupId),
    getCategoriesWithCostType(supabase, groupId),
    getCategoryBreakdowns(supabase, groupId),
    getTags(supabase, groupId),
    getGroupMembers(supabase, groupId),
  ]);
  // メンバーの相手の名前はメンバーの表示名を使うため、メンバーの取得後に取得する
  const counterparts = await getCounterparts(supabase, groupId, members);

  return (
    <PayeeSettingsManager
      initialPayees={payees}
      categories={categories}
      breakdowns={breakdowns}
      counterparts={counterparts}
      tags={tags}
      members={members}
      currentUserId={user!.id}
      isAdmin={membership!.role === "admin"}
    />
  );
}
