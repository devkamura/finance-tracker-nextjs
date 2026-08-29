"use server";

import { buildReceiptJson } from "@/lib/google/build-receipt-json";
import { uploadJsonToDrive } from "@/lib/google/drive-client";
import { getCurrentMembership, getGroupAdminUserId } from "@/lib/supabase/group";
import { getDisplayName } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { validateReceiptForm } from "@/lib/validation/receipt-rules";
import type { ReceiptFormState } from "@/types/receipt";

export type SubmitReceiptResult =
  | { success: true }
  | { success: false; errors: string[] };

function toYYYYMMDDHHmm(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

export async function submitReceipt(
  state: ReceiptFormState
): Promise<SubmitReceiptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, errors: ["ログインが必要です。"] };
  }

  const errors = validateReceiptForm(state);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  try {
    const membership = await getCurrentMembership(supabase, user.id);
    if (!membership) {
      return { success: false, errors: ["グループに所属していません。"] };
    }
    const adminUserId = await getGroupAdminUserId(supabase, membership.groupId);
    if (!adminUserId) {
      return { success: false, errors: ["グループの管理者が見つかりません。"] };
    }

    const now = new Date();
    const displayName = await getDisplayName(supabase, user.id, user.email ?? "");
    const json = await buildReceiptJson(supabase, state, displayName, now);
    const filename = `receipt_${toYYYYMMDDHHmm(now)}.json`;
    // 投稿者本人ではなく、グループ管理者のGoogle Driveへアップロードする
    // （各メンバーが自分のDriveを用意する必要をなくし、家計簿データを1箇所に集約するため）。
    await uploadJsonToDrive(adminUserId, filename, json);
    return { success: true };
  } catch (e) {
    console.error("Failed to upload receipt to Google Drive", e);
    const message =
      e instanceof Error ? e.message : "Google Drive へのアップロードに失敗しました。";
    return { success: false, errors: [message] };
  }
}
