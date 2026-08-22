import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

// service_role権限を持つ管理用クライアント。
// google_tokensテーブルなど、RLSでPostgREST公開APIから遮断しているテーブルへの
// アクセス専用。サーバー側コード以外からは絶対にimportしないこと
// （"server-only"がクライアントバンドルへの混入をビルド時に検出する）。
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
