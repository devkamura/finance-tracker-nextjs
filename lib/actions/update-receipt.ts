"use server";

import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import {
  buildReceiptDetailRows,
  buildReceiptDetailSceneRows,
  resolveStoreName,
} from "@/lib/receipts/shared";
import { deleteReceiptImage, uploadReceiptImage } from "@/lib/supabase/storage";
import { validateReceiptForm } from "@/lib/validation/receipt-rules";
import type { ReceiptFormState } from "@/types/receipt";

export type UpdateReceiptResult =
  | { success: true }
  | { success: false; errors: string[] };

const LOCKED_MESSAGE =
  "この月の精算は確定済みのため変更できません。管理者に再オープンを依頼してください。";

// 画像は imageFile が渡された場合のみ差し替える。nullの場合は既存の画像を維持する
// （「画像だけ削除して未設定に戻す」操作は今回のスコープでは提供しない）。
export async function updateReceipt(
  receiptId: string,
  formData: FormData
): Promise<UpdateReceiptResult> {
  const stateJson = formData.get("state");
  if (typeof stateJson !== "string") {
    return { success: false, errors: ["不正なリクエストです。"] };
  }
  let state: ReceiptFormState;
  try {
    state = JSON.parse(stateJson);
  } catch {
    return { success: false, errors: ["不正なリクエストです。"] };
  }
  const imageEntry = formData.get("image");
  const imageFile =
    imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, errors: ["ログインが必要です。"] };
  }

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) {
    return { success: false, errors: ["グループに所属していません。"] };
  }

  const { data: existing } = await supabase
    .from("receipts")
    .select("id, group_id, occurred_at, receipt_image_path")
    .eq("id", receiptId)
    .maybeSingle();

  if (!existing || existing.group_id !== membership.groupId) {
    return { success: false, errors: ["レシートが見つかりません。"] };
  }

  const members = await getGroupMembers(supabase, membership.groupId);
  const { errors } = validateReceiptForm(
    state,
    members.map((m) => m.userId)
  );
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const occurredAt = state.datetime
    ? new Date(state.datetime).toISOString()
    : existing.occurred_at;

  const [{ data: oldConfirmed }, { data: newConfirmed }] = await Promise.all([
    supabase.rpc("is_settlement_confirmed", {
      p_group_id: membership.groupId,
      p_occurred_at: existing.occurred_at,
    }),
    supabase.rpc("is_settlement_confirmed", {
      p_group_id: membership.groupId,
      p_occurred_at: occurredAt,
    }),
  ]);
  if (oldConfirmed || newConfirmed) {
    return { success: false, errors: [LOCKED_MESSAGE] };
  }

  let storeId: number | null;
  let storeName: string;
  try {
    ({ storeId, storeName } = await resolveStoreName(
      supabase,
      state.storeSelect,
      state.storeInputText
    ));
  } catch (e) {
    return {
      success: false,
      errors: [e instanceof Error ? e.message : "店舗の解決に失敗しました。"],
    };
  }

  let receiptImagePath = existing.receipt_image_path;
  if (imageFile && imageFile.size > 0) {
    try {
      const newPath = await uploadReceiptImage(
        supabase,
        membership.groupId,
        receiptId,
        imageFile
      );
      if (existing.receipt_image_path) {
        await deleteReceiptImage(supabase, existing.receipt_image_path);
      }
      receiptImagePath = newPath;
    } catch (e) {
      console.error("Failed to upload receipt image", e);
      return {
        success: false,
        errors: ["レシート画像のアップロードに失敗しました。"],
      };
    }
  }

  const { error: updateError } = await supabase
    .from("receipts")
    .update({
      store_id: storeId,
      store_name: storeName,
      transaction_type_id: Number(state.transactionTypeId),
      occurred_at: occurredAt,
      amount: Number(state.amount),
      receipt_image_path: receiptImagePath,
    })
    .eq("id", receiptId);

  if (updateError) {
    console.error("Failed to update receipt", updateError);
    return { success: false, errors: ["レシートの更新に失敗しました。"] };
  }

  // 明細は一旦削除して作り直す（receipt_detail_scenesはon delete cascadeで連動削除される）。
  const { error: deleteDetailsError } = await supabase
    .from("receipt_details")
    .delete()
    .eq("receipt_id", receiptId);
  if (deleteDetailsError) {
    console.error("Failed to clear receipt details", deleteDetailsError);
    return { success: false, errors: ["レシート明細の更新に失敗しました。"] };
  }

  const { data: insertedDetails, error: detailsError } = await supabase
    .from("receipt_details")
    .insert(buildReceiptDetailRows(state.items, receiptId))
    .select("id");

  if (detailsError || !insertedDetails) {
    console.error("Failed to insert receipt details", detailsError);
    return { success: false, errors: ["レシート明細の更新に失敗しました。"] };
  }

  const sceneRows = buildReceiptDetailSceneRows(state.items, insertedDetails);
  if (sceneRows.length > 0) {
    const { error: sceneError } = await supabase
      .from("receipt_detail_scenes")
      .insert(sceneRows);
    if (sceneError) {
      console.error("Failed to insert receipt detail scenes", sceneError);
    }
  }

  return { success: true };
}
