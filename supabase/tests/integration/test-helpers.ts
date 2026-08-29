import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

// lib/supabase/admin.tsは"server-only"を宣言しておりNode環境のテストから
// 直接importできないため、ここでは@supabase/supabase-jsを直接使う。
export function createServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type TestUser = {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
};

// service_roleでメール確認済みのテストユーザーを作成し、
// anonクライアントでサインインしてauth.uid()が実際に効くセッションを作る。
export async function createSignedInTestUser(
  admin: SupabaseClient<Database>,
  emailPrefix: string
): Promise<TestUser> {
  const email = `${emailPrefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@example.com`;
  const password = "test-password-12345";

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createError || !created.user) {
    throw createError ?? new Error("failed to create test user");
  }

  const client = createAnonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw signInError;
  }

  return { id: created.user.id, email, client };
}

// テストで作成したユーザーを削除する。groups.created_byの外部キー制約(on delete指定なし)
// によりユーザー削除前にそのユーザーが作成したgroupsを削除しておく必要がある。
export async function deleteTestUser(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  await admin.from("groups").delete().eq("created_by", userId);
  await admin.auth.admin.deleteUser(userId);
}
