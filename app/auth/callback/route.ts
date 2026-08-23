import { NextResponse } from "next/server";

import { upsertGoogleTokens } from "@/lib/google/tokens";
import { createClient } from "@/lib/supabase/server";

// Supabase AuthのGoogle OAuthコールバック。
// 認可コードをセッションに交換し、Google Driveアップロードに必要な
// access_token/refresh_tokenをgoogle_tokensテーブルへ保存する。
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
      const { session } = data;
      if (session.provider_token) {
        try {
          await upsertGoogleTokens(session.user.id, {
            accessToken: session.provider_token,
            refreshToken: session.provider_refresh_token,
            // Supabaseのセッションには正確な有効期限が含まれないため、
            // Googleのaccess_token標準的な有効期間(1時間)を暫定値として保存し、
            // 実際の利用時は余裕を持って早めにリフレッシュする。
            expiresAt: new Date(Date.now() + 3600 * 1000),
          });
        } catch (e) {
          console.error("Failed to save Google tokens", e);
          return NextResponse.redirect(`${origin}/login?error=google_token`);
        }
      }
      console.log("[auth/callback] redirecting to origin root", origin);
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
