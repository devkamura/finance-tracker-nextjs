import { redirect } from "next/navigation";

import { GroupSetupForm } from "@/components/admin/GroupSetupForm";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// (app)/layout.tsxのゲートには含めない：
// 未所属ユーザーをここへ誘導する側なので、同じゲートに巻き込むと
// 「未所属→ここへ→ゲートが未所属判定→ここへ…」という無限リダイレクトになる。
export default async function GroupSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const membership = await getCurrentMembership(supabase, user.id);
  if (membership) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">グループを作成</h1>
        <p className="mt-2 text-sm text-slate-500">
          まだどのグループにも所属していません。新しいグループを作成すると、あなたがそのグループの管理者になります。
        </p>
        <div className="mt-6">
          <GroupSetupForm />
        </div>
      </div>
    </main>
  );
}
