"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import {
  buildReceiptDetailRows,
  buildReceiptDetailSceneRows,
  resolvePayeeName,
} from "@/lib/receipts/shared";
import { buildPartnerItems, findPartner } from "@/lib/receipts/duplicate";
import { deleteReceiptImage, uploadReceiptImage } from "@/lib/supabase/storage";
import { validateReceiptForm } from "@/lib/validation/receipt-rules";
import type { ReceiptFormState, ReceiptItem } from "@/types/receipt";

export type CreateReceiptResult =
  | { success: true; receiptId: string }
  | { success: false; errors: string[] };

// 画像ファイルを含むため、既存のextractReceiptOcrと同じくFormData経由で受け取る
// （state はJSON文字列化してformDataの"state"フィールドに積む）。
// formDataの"duplicateForPartner"が"true"の場合は、相方を支払者とした同じ内容の
// レシートも同時に登録する（複製登録。docs/requirements.md参照）。
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

  let payeeId: number | null;
  let payeeName: string;
  try {
    ({ payeeId, payeeName } = await resolvePayeeName(
      supabase,
      state.payeeSelect,
      state.payeeInputText
    ));
  } catch (e) {
    return {
      success: false,
      errors: [e instanceof Error ? e.message : "支払い先の解決に失敗しました。"],
    };
  }

  // 相方分の複製登録の指定（登録画面のチェックボックス）。
  const duplicateForPartner = formData.get("duplicateForPartner") === "true";
  const partner = duplicateForPartner ? findPartner(members, user.id) : null;
  if (duplicateForPartner && !partner) {
    return {
      success: false,
      errors: ["相方がグループにいないため、複製登録できません。"],
    };
  }

  const baseInput = {
    groupId: membership.groupId,
    payeeId,
    payeeName,
    transactionTypeId: Number(state.transactionTypeId),
    occurredAt,
    amount: Number(state.amount),
    createdBy: user.id,
    imageFile,
  };

  // 自分（登録者本人が支払者）のレシート
  const ownResult = await insertReceiptWithDetails(supabase, {
    ...baseInput,
    items: state.items,
    payerUserId: user.id,
    isDuplicated: false,
  });
  if (!ownResult.success) {
    return { success: false, errors: [ownResult.error] };
  }

  if (partner) {
    // 相方分のレシート。支払者＝相方、帰属先は私→相方のみ置き換え、
    // 画像は別ファイルとしてアップロードする（片方の削除・差し替えが他方に影響しないように）。
    const partnerResult = await insertReceiptWithDetails(supabase, {
      ...baseInput,
      items: buildPartnerItems(state.items, user.id, partner.userId),
      payerUserId: partner.userId,
      isDuplicated: true,
    });
    if (!partnerResult.success) {
      // 2件とも登録するか両方登録しないかのどちらかにするため、自分のレシートも取り消す
      // （明細・シーンはon delete cascadeで消える）。ベストエフォートの補償処理。
      await supabase.from("receipts").delete().eq("id", ownResult.receiptId);
      if (ownResult.receiptImagePath) {
        await deleteReceiptImage(supabase, ownResult.receiptImagePath);
      }
      return {
        success: false,
        errors: ["相方分のレシートの登録に失敗しました。"],
      };
    }
  }

  return { success: true, receiptId: ownResult.receiptId };
}

type InsertReceiptInput = {
  groupId: string;
  payeeId: number | null;
  payeeName: string;
  transactionTypeId: number;
  occurredAt: string;
  amount: number;
  createdBy: string;
  imageFile: File | null;
  items: ReceiptItem[];
  payerUserId: string;
  isDuplicated: boolean;
};

type InsertReceiptResult =
  | { success: true; receiptId: string; receiptImagePath: string | null }
  | { success: false; error: string };

// レシート1件分（画像・本体・明細・シーン）を登録する。
// 途中で失敗した場合は、その1件分で作成済みのデータを補償的に削除してからエラーを返す。
async function insertReceiptWithDetails(
  supabase: SupabaseClient,
  input: InsertReceiptInput
): Promise<InsertReceiptResult> {
  const receiptId = crypto.randomUUID();
  let receiptImagePath: string | null = null;
  if (input.imageFile) {
    try {
      receiptImagePath = await uploadReceiptImage(
        supabase,
        input.groupId,
        receiptId,
        input.imageFile
      );
    } catch (e) {
      console.error("Failed to upload receipt image", e);
      return {
        success: false,
        error: "レシート画像のアップロードに失敗しました。",
      };
    }
  }

  const { error: receiptError } = await supabase.from("receipts").insert({
    id: receiptId,
    group_id: input.groupId,
    payee_id: input.payeeId,
    payee_name: input.payeeName,
    transaction_type_id: input.transactionTypeId,
    occurred_at: input.occurredAt,
    payer_user_id: input.payerUserId,
    created_by: input.createdBy,
    amount: input.amount,
    receipt_image_path: receiptImagePath,
    is_duplicated: input.isDuplicated,
  });

  if (receiptError) {
    console.error("Failed to insert receipt", receiptError);
    if (receiptImagePath) {
      await deleteReceiptImage(supabase, receiptImagePath);
    }
    return { success: false, error: "レシートの登録に失敗しました。" };
  }

  const { data: insertedDetails, error: detailsError } = await supabase
    .from("receipt_details")
    .insert(buildReceiptDetailRows(input.items, receiptId))
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
    return { success: false, error: "レシート明細の登録に失敗しました。" };
  }

  const sceneRows = buildReceiptDetailSceneRows(input.items, insertedDetails);
  if (sceneRows.length > 0) {
    const { error: sceneError } = await supabase
      .from("receipt_detail_scenes")
      .insert(sceneRows);
    if (sceneError) {
      // シーンはあくまで任意タグのため、失敗してもレシート登録全体は成功とする。
      console.error("Failed to insert receipt detail scenes", sceneError);
    }
  }

  return { success: true, receiptId, receiptImagePath };
}
