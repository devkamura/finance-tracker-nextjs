import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type GoogleTokenRow = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
  token_type: string | null;
};

export async function getGoogleTokens(
  userId: string
): Promise<GoogleTokenRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_tokens")
    .select("access_token, refresh_token, expires_at, scope, token_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ログインのたびに呼ばれる。Googleはprompt=consentでも毎回refresh_tokenを
// 返すとは限らないため、渡されなかった場合は既存の値を維持する。
export async function upsertGoogleTokens(
  userId: string,
  patch: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt: Date;
    scope?: string | null;
    tokenType?: string | null;
  }
): Promise<void> {
  const admin = createAdminClient();

  let refreshToken = patch.refreshToken;
  if (!refreshToken) {
    const existing = await getGoogleTokens(userId);
    refreshToken = existing?.refresh_token;
  }

  if (!refreshToken) {
    throw new Error(
      "Googleのrefresh_tokenを取得できませんでした。再ログインしてください。"
    );
  }

  const { error } = await admin.from("google_tokens").upsert({
    user_id: userId,
    access_token: patch.accessToken,
    refresh_token: refreshToken,
    expires_at: patch.expiresAt.toISOString(),
    scope: patch.scope ?? null,
    token_type: patch.tokenType ?? null,
  });

  if (error) throw error;
}

export async function updateGoogleAccessToken(
  userId: string,
  patch: { accessToken: string; expiresAt: Date }
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("google_tokens")
    .update({
      access_token: patch.accessToken,
      expires_at: patch.expiresAt.toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw error;
}
