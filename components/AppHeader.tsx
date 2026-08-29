import Link from "next/link";
import { redirect } from "next/navigation";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";

import { getCurrentMembership } from "@/lib/supabase/group";
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

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-bold text-slate-900">
          家計簿
        </Link>
        {user && displayName && (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{displayName}</span>
            {membership?.role === "admin" && (
              <Link
                href="/admin"
                className="flex items-center gap-1 hover:text-slate-900"
              >
                <FontAwesomeIcon icon={faGear} />
                管理画面
              </Link>
            )}
            <form
              action={async () => {
                "use server";
                const supabase = await createClient();
                await supabase.auth.signOut();
                redirect("/login");
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-1 text-slate-500 hover:text-slate-800"
              >
                <FontAwesomeIcon icon={faRightFromBracket} />
                ログアウト
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
