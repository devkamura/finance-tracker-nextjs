import "server-only";

import { OWNER_JOINT_VALUE, SELECT_NONE_VALUE } from "@/lib/constants";
import { findPayeeByName, isSelectablePayee, type Payee } from "@/lib/receipts/payees";
import type { ReceiptItem } from "@/types/receipt";

// 選ばれた支払い先から、レシートに保存する支払い先ID・名前を求める。
// 選べるのはグループ全体と自分用の、非表示でない支払い先（docs/分析拡充/基本設計書.md 3.5節）。
// 編集で、保存済みの支払い先（相方用・非表示になったもの）をそのまま保存する場合は許す。
// 手入力の店名が支払い先の名前か別名と一致したら、その支払い先として保存する
// （支払い先IDと名前だけを変え、明細には既定値を当てない。docs/分析拡充/要件定義書.md 4.7節）。
export function resolvePayeeName(
  payees: Payee[],
  payeeSelect: string,
  payeeInputText: string,
  currentUserId: string,
  existingPayeeId: number | null = null
): { payeeId: number | null; payeeName: string } {
  if (!payeeSelect || payeeSelect === SELECT_NONE_VALUE) {
    const matched = findPayeeByName(payees, payeeInputText, currentUserId);
    return matched
      ? { payeeId: matched.id, payeeName: matched.name }
      : { payeeId: null, payeeName: payeeInputText };
  }

  const payee = payees.find((p) => String(p.id) === payeeSelect);
  if (!payee || (!isSelectablePayee(payee, currentUserId) && payee.id !== existingPayeeId)) {
    throw new Error("支払い先が見つかりません。");
  }
  return { payeeId: payee.id, payeeName: payee.name };
}

export function buildReceiptDetailRows(items: ReceiptItem[], receiptId: string) {
  return items.map((item) => ({
    receipt_id: receiptId,
    item_name: item.name,
    price: Number(item.price),
    tax_type: item.taxType,
    tax_rate_id: item.taxType === "exclusive" ? Number(item.taxRateId) : null,
    category_id: Number(item.categoryId),
    breakdown_id: item.breakdownId ? Number(item.breakdownId) : null,
    counterpart_id: Number(item.counterpartId),
    owner_user_id:
      item.ownerUserId === OWNER_JOINT_VALUE ? null : item.ownerUserId,
  }));
}

export function buildReceiptDetailTagRows(
  items: ReceiptItem[],
  insertedDetails: { id: string }[]
) {
  return items.flatMap((item, index) =>
    item.tagIds.map((tagId) => ({
      receipt_detail_id: insertedDetails[index].id,
      tag_id: Number(tagId),
    }))
  );
}
