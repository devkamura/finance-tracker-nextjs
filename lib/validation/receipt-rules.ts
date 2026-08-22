import type { ReceiptFormState } from "@/types/receipt";

export function validateReceiptForm(state: ReceiptFormState): string[] {
  const errors: string[] = [];

  if (!state.transactionTypeId) {
    errors.push("支出 / 返金は必須です。");
  }
  if (!state.amount) {
    errors.push("合計金額は必須です。");
  }
  if (state.items.length === 0) {
    errors.push("レシート項目を1件以上入力してください。");
  }

  state.items.forEach((item, i) => {
    const n = i + 1;
    if (!item.price) {
      errors.push(`項目${n}: 価格は必須です。`);
    } else if (!/^\d+$/.test(item.price)) {
      errors.push(`項目${n}: 価格は数値でなければなりません。`);
    }
    if (!item.taxRateId) {
      errors.push(`項目${n}: 税率は必須です。`);
    }
    if (!item.categoryId) {
      errors.push(`項目${n}: カテゴリーは必須です。`);
    }
    if (!item.purposeId) {
      errors.push(`項目${n}: 目的は必須です。`);
    }
  });

  return errors;
}
