import { redirect } from "next/navigation";

import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 親の(app)/layout.tsxでログイン・グループ所属は保証済みだが、
// 管理者ロールの判定はここで追加で行う。非管理者は/へ戻す。
export default async function AdminLayout({
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
  if (!membership || membership.role !== "admin") {
    redirect("/");
  }

  return <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>;
}
