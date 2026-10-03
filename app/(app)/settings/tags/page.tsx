import { TagSettingsManager } from "@/components/settings/TagSettingsManager";
import { getTags } from "@/lib/settings/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 設定 ＞ タグ（docs/分析拡充/基本設計書.md 2.5節）。
// 編集は管理者のみ。管理者以外には閲覧だけを表示する。
export default async function TagSettingsPage() {
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const tags = await getTags(supabase, membership!.groupId);

  return <TagSettingsManager tags={tags} canEdit={membership!.role === "admin"} />;
}
