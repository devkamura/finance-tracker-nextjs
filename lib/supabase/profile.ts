import type { SupabaseClient } from "@supabase/supabase-js";

// プロフィール取得失敗時（未バックフィルの旧ユーザー等）はフォールバック値を返す。
export async function getDisplayName(
  supabase: SupabaseClient,
  userId: string,
  fallback: string
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  return data?.display_name ?? fallback;
}
