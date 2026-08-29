import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// ログイン必須＋グループ所属必須のゲート。保護対象ページが複数になるため、
// 各page.tsxで個別にチェックする既存の慣習から、layoutへの集約に切り替える。
// 最終的な防御はDBのRLSが担うため、ここでのredirectはあくまでUX上の導線。
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) {
    redirect("/setup/group");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      {children}
    </div>
  );
}
