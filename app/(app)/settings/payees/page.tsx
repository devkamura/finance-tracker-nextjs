import { PayeeSettingsManager } from "@/components/settings/PayeeSettingsManager";
import {
  getCategoriesWithCostType,
  getCategoryBreakdowns,
  getCounterparts,
  getPayees,
  getTags,
  getUsedSettingIds,
} from "@/lib/settings/queries";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 設定 ＞ 支払い先（docs/requirements.md「追加機能：支払い先の一本化」）。
// 支払い先はグループで1つの一覧。メンバー全員が編集でき、表示／非表示は自分の分だけ切り替える。
export default async function PayeeSettingsPage() {
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);
  const groupId = membership!.groupId;

  const [payees, categories, breakdowns, tags, members, used] = await Promise.all([
    getPayees(supabase, groupId),
    getCategoriesWithCostType(supabase, groupId),
    getCategoryBreakdowns(supabase, groupId),
    getTags(supabase, groupId),
    getGroupMembers(supabase, groupId),
    getUsedSettingIds(supabase, groupId),
  ]);
  // メンバーの相手の名前はメンバーの表示名を使うため、メンバーの取得後に取得する
  const counterparts = await getCounterparts(supabase, groupId, members);

  return (
    <PayeeSettingsManager
      initialPayees={payees}
      usedPayeeIds={used.payees}
      categories={categories}
      breakdowns={breakdowns}
      counterparts={counterparts}
      tags={tags}
      members={members}
      currentUserId={user!.id}
    />
  );
}
