import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { OWNER_JOINT_VALUE, SELECT_NONE_VALUE } from "@/lib/constants";
import type { ReceiptItem } from "@/types/receipt";

export async function resolvePayeeName(
  supabase: SupabaseClient,
  payeeSelect: string,
  payeeInputText: string
): Promise<{ payeeId: number | null; payeeName: string }> {
  if (!payeeSelect || payeeSelect === SELECT_NONE_VALUE) {
    return { payeeId: null, payeeName: payeeInputText };
  }

  const { data, error } = await supabase
    .from("payees")
    .select("name")
    .eq("id", Number(payeeSelect))
    .single();
  if (error || !data) {
    throw new Error("支払い先が見つかりません。");
  }
  return { payeeId: Number(payeeSelect), payeeName: data.name };
}

export function buildReceiptDetailRows(items: ReceiptItem[], receiptId: string) {
  return items.map((item) => ({
    receipt_id: receiptId,
    item_name: item.name,
    price: Number(item.price),
    tax_type: item.taxType,
    tax_rate_id: item.taxType === "exclusive" ? Number(item.taxRateId) : null,
    category_id: Number(item.categoryId),
    purpose_id: Number(item.purposeId),
    owner_user_id:
      item.ownerUserId === OWNER_JOINT_VALUE ? null : item.ownerUserId,
  }));
}

export function buildReceiptDetailSceneRows(
  items: ReceiptItem[],
  insertedDetails: { id: string }[]
) {
  return items.flatMap((item, index) =>
    item.sceneIds.map((sceneId) => ({
      receipt_detail_id: insertedDetails[index].id,
      scene_id: Number(sceneId),
    }))
  );
}
