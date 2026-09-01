"use server";

import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import { deleteReceiptImage } from "@/lib/supabase/storage";

export type DeleteReceiptResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteReceipt(
  receiptId: string
): Promise<DeleteReceiptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) {
    return { success: false, error: "グループに所属していません。" };
  }

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, group_id, occurred_at, receipt_image_path")
    .eq("id", receiptId)
    .maybeSingle();

  if (!receipt || receipt.group_id !== membership.groupId) {
    return { success: false, error: "レシートが見つかりません。" };
  }

  const { data: confirmed } = await supabase.rpc("is_settlement_confirmed", {
    p_group_id: membership.groupId,
    p_occurred_at: receipt.occurred_at,
  });
  if (confirmed) {
    return {
      success: false,
      error:
        "この月の精算は確定済みのため削除できません。管理者に再オープンを依頼してください。",
    };
  }

  const { error } = await supabase.from("receipts").delete().eq("id", receiptId);
  if (error) {
    console.error("Failed to delete receipt", error);
    return { success: false, error: "レシートの削除に失敗しました。" };
  }

  if (receipt.receipt_image_path) {
    await deleteReceiptImage(supabase, receipt.receipt_image_path);
  }

  return { success: true };
}
