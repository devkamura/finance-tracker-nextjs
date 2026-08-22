import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";

// Server Component / Server Action / Route Handler から利用するSupabaseクライアント。
// Server Componentからの呼び出しではCookieの書き込みができないため、
// setAllのエラーは握りつぶす（セッションのリフレッシュはmiddlewareが担う）。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Componentから呼ばれた場合はここに到達するが、
            // middlewareがセッションリフレッシュを担うため無視してよい。
          }
        },
      },
    }
  );
}
