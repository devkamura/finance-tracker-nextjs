import Link from "next/link";
import { redirect } from "next/navigation";

import { HeaderNav } from "@/components/HeaderNav";
import { getCurrentMembership, getGroupName } from "@/lib/supabase/group";
import { getDisplayName } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName = user
    ? await getDisplayName(supabase, user.id, user.email ?? "")
    : null;
  const membership = user
    ? await getCurrentMembership(supabase, user.id)
    : null;
  const groupName = membership
    ? await getGroupName(supabase, membership.groupId)
    : null;

  async function logout() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900">家計簿</span>
          {groupName && (
            <span className="truncate text-xs text-slate-400">
              {groupName}
            </span>
          )}
        </Link>
        {user && displayName && (
          <HeaderNav
            displayName={displayName}
            isAdmin={membership?.role === "admin"}
            onLogout={logout}
          />
        )}
      </div>
    </header>
  );
}
