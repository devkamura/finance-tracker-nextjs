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

export type CreateReceiptResult =
  | { success: true; receiptId: string }
  | { success: false; errors: string[] };

// 画像ファイルを含むため、既存のextractReceiptOcrと同じくFormData経由で受け取る
// （state はJSON文字列化してformDataの"state"フィールドに積む）。
export async function createReceipt(
  formData: FormData
): Promise<CreateReceiptResult> {
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
    : new Date().toISOString();

  const { data: confirmed } = await supabase.rpc("is_settlement_confirmed", {
    p_group_id: membership.groupId,
    p_occurred_at: occurredAt,
  });
  if (confirmed) {
    return {
      success: false,
      errors: [
        "この月の精算は確定済みのため登録できません。管理者に再オープンを依頼してください。",
      ],
    };
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

  const receiptId = crypto.randomUUID();
  let receiptImagePath: string | null = null;
  if (imageFile && imageFile.size > 0) {
    try {
      receiptImagePath = await uploadReceiptImage(
        supabase,
        membership.groupId,
        receiptId,
        imageFile
      );
    } catch (e) {
      console.error("Failed to upload receipt image", e);
      return {
        success: false,
        errors: ["レシート画像のアップロードに失敗しました。"],
      };
    }
  }

  const { error: receiptError } = await supabase.from("receipts").insert({
    id: receiptId,
    group_id: membership.groupId,
    store_id: storeId,
    store_name: storeName,
    transaction_type_id: Number(state.transactionTypeId),
    occurred_at: occurredAt,
    payer_user_id: user.id,
    created_by: user.id,
    amount: Number(state.amount),
    receipt_image_path: receiptImagePath,
  });

  if (receiptError) {
    console.error("Failed to insert receipt", receiptError);
    if (receiptImagePath) {
      await deleteReceiptImage(supabase, receiptImagePath);
    }
    return { success: false, errors: ["レシートの登録に失敗しました。"] };
  }

  const { data: insertedDetails, error: detailsError } = await supabase
    .from("receipt_details")
    .insert(buildReceiptDetailRows(state.items, receiptId))
    .select("id");

  if (detailsError || !insertedDetails) {
    console.error("Failed to insert receipt details", detailsError);
    // 明細の登録に失敗した場合、レシート本体だけが残ってしまわないよう削除する
    // （receiptsとreceipt_detailsをまたぐ1トランザクションにはしていないため、
    // ベストエフォートの補償処理として行う）。
    await supabase.from("receipts").delete().eq("id", receiptId);
    if (receiptImagePath) {
      await deleteReceiptImage(supabase, receiptImagePath);
    }
    return { success: false, errors: ["レシート明細の登録に失敗しました。"] };
  }

  const sceneRows = buildReceiptDetailSceneRows(state.items, insertedDetails);
  if (sceneRows.length > 0) {
    const { error: sceneError } = await supabase
      .from("receipt_detail_scenes")
      .insert(sceneRows);
    if (sceneError) {
      // シーンはあくまで任意タグのため、失敗してもレシート登録全体は成功とする。
      console.error("Failed to insert receipt detail scenes", sceneError);
    }
  }

  return { success: true, receiptId };
}
