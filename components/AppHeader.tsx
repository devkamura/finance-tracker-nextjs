import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";

import { auth, signOut } from "@/auth";

export async function AppHeader() {
  const session = await auth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
        <h1 className="text-lg font-bold text-slate-900">家計簿</h1>
        {session?.user && (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
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
