import { OWNER_JOINT_VALUE } from "@/lib/constants";
import {
  isBreakdownOfCategory,
  isBreakdownRequired,
  type CategoryBreakdown,
} from "@/lib/receipts/breakdowns";
import type { ReceiptFormState } from "@/types/receipt";

export type ReceiptItemFieldErrors = {
  price?: boolean;
  taxRateId?: boolean;
  categoryId?: boolean;
  breakdownId?: boolean;
  purposeId?: boolean;
  ownerUserId?: boolean;
};

export type ReceiptFormFieldErrors = {
  transactionTypeId?: boolean;
  amount?: boolean;
  items: Record<string, ReceiptItemFieldErrors>; // clientIdをキーとする
};

export type ReceiptFormValidationResult = {
  errors: string[]; // 画面上部のエラー一覧に表示するメッセージ
  fieldErrors: ReceiptFormFieldErrors;
};

// memberUserIds: 帰属先として選択可能なグループメンバーのuser_id一覧。
// クライアント入力を信用せず、帰属先が実在するグループメンバー（または共同）に
// 限定されているかをここで検証する。
// breakdowns: グループのカテゴリの内訳（非表示を含む）。内訳を設定したカテゴリでは
// 内訳を必須とし、選んだ内訳がそのカテゴリのものかを検証する（docs/分析拡充/基本設計書.md 3.1節）。
export function validateReceiptForm(
  state: ReceiptFormState,
  memberUserIds: string[],
  breakdowns: CategoryBreakdown[]
): ReceiptFormValidationResult {
  const errors: string[] = [];
  const fieldErrors: ReceiptFormFieldErrors = { items: {} };

  if (!state.transactionTypeId) {
    errors.push("支出 / 返金は必須です。");
    fieldErrors.transactionTypeId = true;
  }
  if (!state.amount) {
    errors.push("合計金額は必須です。");
    fieldErrors.amount = true;
  }
  if (state.items.length === 0) {
    errors.push("レシート項目を1件以上入力してください。");
  }

  state.items.forEach((item, i) => {
    const n = i + 1;
    const itemErrors: ReceiptItemFieldErrors = {};

    if (!item.price) {
      errors.push(`項目${n}: 価格は必須です。`);
      itemErrors.price = true;
    } else if (!/^\d+$/.test(item.price)) {
      errors.push(`項目${n}: 価格は数値でなければなりません。`);
      itemErrors.price = true;
    }
    if (item.taxType === "exclusive" && !item.taxRateId) {
      errors.push(`項目${n}: 税別の場合は税率が必須です。`);
      itemErrors.taxRateId = true;
    }
    if (!item.categoryId) {
      errors.push(`項目${n}: カテゴリーは必須です。`);
      itemErrors.categoryId = true;
    } else if (item.breakdownId) {
      if (!isBreakdownOfCategory(item.breakdownId, item.categoryId, breakdowns)) {
        errors.push(`項目${n}: 内訳が不正です。`);
        itemErrors.breakdownId = true;
      }
    } else if (isBreakdownRequired(item.categoryId, breakdowns)) {
      errors.push(`項目${n}: 内訳は必須です。`);
      itemErrors.breakdownId = true;
    }
    if (!item.purposeId) {
      errors.push(`項目${n}: 目的は必須です。`);
      itemErrors.purposeId = true;
    }
    if (!item.ownerUserId) {
      errors.push(`項目${n}: 帰属先は必須です。`);
      itemErrors.ownerUserId = true;
    } else if (
      item.ownerUserId !== OWNER_JOINT_VALUE &&
      !memberUserIds.includes(item.ownerUserId)
    ) {
      errors.push(`項目${n}: 帰属先が不正です。`);
      itemErrors.ownerUserId = true;
    }

    if (Object.keys(itemErrors).length > 0) {
      fieldErrors.items[item.clientId] = itemErrors;
    }
  });

  return { errors, fieldErrors };
}
