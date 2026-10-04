import { CounterpartSettingsManager } from "@/components/settings/CounterpartSettingsManager";
import { getCounterparts, getUsedSettingIds } from "@/lib/settings/queries";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 設定 ＞ 相手（docs/分析拡充/基本設計書.md 2.4節）。
// 編集は管理者のみ。管理者以外には閲覧だけを表示する。
export default async function CounterpartSettingsPage() {
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const [members, used] = await Promise.all([
    getGroupMembers(supabase, membership!.groupId),
    getUsedSettingIds(supabase, membership!.groupId),
  ]);
  const counterparts = await getCounterparts(supabase, membership!.groupId, members);

  return (
    <CounterpartSettingsManager
      counterparts={counterparts}
      usedCounterpartIds={used.counterparts}
      canEdit={membership!.role === "admin"}
    />
  );
}
