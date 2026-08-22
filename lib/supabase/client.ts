import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";

// クライアントコンポーネントから利用するSupabaseクライアント。
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
