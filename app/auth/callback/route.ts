import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Supabase AuthのGoogle OAuthコールバック。認可コードをセッションに交換する。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    console.log("[auth/callback] received code present");
    const supabase = await createClient();
    let res;
    try {
      res = await supabase.auth.exchangeCodeForSession(code);
    } catch (e) {
      console.error("[auth/callback] exchangeCodeForSession threw", e);
    }

    const error = res?.error ?? null;
    const data = res?.data ?? null;

    console.log("[auth/callback] exchange result:", {
      error: error ? (error.message || error) : null,
      hasSession: !!data?.session?.user,
      userId: data?.session?.user?.id ?? null,
    });

    if (error) {
      console.error("exchangeCodeForSession failed", error);
    }

    if (!error && data?.session?.user) {
      // 管理者が事前にGmailアドレスだけで招待登録していた場合、
      // ここで本人のuser_idと突き合わせてグループメンバーとして紐付ける。
      // 失敗してもログイン自体は継続させる（招待紐付けの失敗は致命的ではない）。
      const { error: linkError } = await supabase.rpc(
        "link_pending_group_memberships"
      );
      if (linkError) {
        console.error("Failed to link pending group memberships", linkError);
      }

      console.log("[auth/callback] redirecting to origin root", origin);
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
