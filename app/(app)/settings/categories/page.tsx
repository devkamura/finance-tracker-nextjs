import { CategorySettingsManager } from "@/components/settings/CategorySettingsManager";
import {
  getCategoriesWithCostType,
  getCategoryBreakdowns,
  getUsedSettingIds,
} from "@/lib/settings/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 設定 ＞ カテゴリ：カテゴリごとの費用区分と内訳（docs/分析拡充/基本設計書.md 2.3節）。
// 編集は管理者のみ。管理者以外には閲覧だけを表示する。
export default async function CategorySettingsPage() {
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const [categories, breakdowns, used] = await Promise.all([
    getCategoriesWithCostType(supabase, membership!.groupId),
    getCategoryBreakdowns(supabase, membership!.groupId),
    getUsedSettingIds(supabase, membership!.groupId),
  ]);

  return (
    <CategorySettingsManager
      categories={categories}
      initialBreakdowns={breakdowns}
      usedBreakdownIds={used.breakdowns}
      canEdit={membership!.role === "admin"}
    />
  );
}
