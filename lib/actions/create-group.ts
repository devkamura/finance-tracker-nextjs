"use server";

import { createClient } from "@/lib/supabase/server";

export type CreateGroupResult =
  | { success: true; groupId: string }
  | { success: false; error: string };

export async function createGroup(name: string): Promise<CreateGroupResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "グループ名を入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const { data, error } = await supabase.rpc("create_group_with_admin", {
    p_name: trimmed,
  });

  if (error) {
    if (error.message.includes("already belongs to a group")) {
      return { success: false, error: "既にグループに所属しています。" };
    }
    console.error("Failed to create group", error);
    return { success: false, error: "グループの作成に失敗しました。" };
  }

  return { success: true, groupId: data.id };
}
