export type TaxType = "inclusive" | "exclusive";

export type ReceiptItem = {
  clientId: string;
  name: string;
  price: string;
  taxType: TaxType;
  taxRateId: string; // taxTypeが"exclusive"の場合のみ必須
  categoryId: string;
  purposeId: string;
  sceneIds: string[];
  // 帰属先。OWNER_JOINT_VALUE（共同）または実際のuser id
  ownerUserId: string;
};

export type ReceiptFormState = {
  payeeSelect: string; // "" | SELECT_NONE_VALUE | 実際のPayee ID(文字列)
  payeeInputText: string;
  datetime: string; // <input type="datetime-local"> の値
  transactionTypeId: string;
  amount: string;
  // 支払者。新規登録時は常に登録者本人に自動設定されるため未使用（""のまま）。
  // 編集時のみ選択可能で、グループメンバーのuser idを保持する。
  payerUserId: string;
  items: ReceiptItem[];
};

export type GroupMemberOption = {
  userId: string;
  displayName: string;
  color: string | null;
};

export type MasterData = {
  payees: { id: number; name: string }[];
  transactionTypes: { id: number; name: string }[];
  consumptionTaxes: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  purposes: { id: number; name: string }[];
  scenes: { id: number; name: string }[];
  members: GroupMemberOption[];
};

// Gemini APIによるレシート画像の読み取り結果
export type OcrReceiptItem = {
  name: string;
  price: number;
};

export type OcrReceiptResult = {
  payeeName: string | null;
  datetime: string | null; // "YYYY-MM-DDTHH:mm" 形式（<input type="datetime-local"> 互換）
  totalPrice: number | null;
  items: OcrReceiptItem[];
};

// レシート詳細画面用
export type ReceiptDetailItemView = {
  id: string;
  itemName: string;
  price: number;
  taxType: TaxType;
  taxRateName: string | null;
  categoryName: string;
  purposeName: string;
  ownerUserId: string | null;
  ownerDisplayName: string; // "共同" またはユーザー表示名
  ownerColor: string | null; // 共同の場合はnull
  sceneNames: string[];
};

export type ReceiptDetailView = {
  id: string;
  occurredAt: string;
  payeeName: string;
  amount: number;
  transactionTypeName: string;
  payerUserId: string;
  payerDisplayName: string;
  payerColor: string | null;
  receiptImageUrl: string | null;
  isLocked: boolean; // 精算確定済み月のため編集・削除不可
  items: ReceiptDetailItemView[];
};

// レシート一覧画面用。一覧のアコーディオンでそのまま明細・画像を確認できるよう、
// 詳細相当の情報も含める（isLockedのみ一覧では取得しない。詳細/編集画面で確認する）。
export type ReceiptListItem = {
  id: string;
  occurredAt: string;
  payeeName: string;
  amount: number;
  transactionTypeName: string;
  payerUserId: string;
  payerDisplayName: string;
  payerColor: string | null;
  receiptImageUrl: string | null;
  items: ReceiptDetailItemView[];
};

// 精算画面用
export type SettlementUserSummary = {
  userId: string;
  displayName: string;
  color: string | null;
  burden: number;
  paid: number;
  diff: number;
};

export type SettlementSummaryView = {
  periodMonth: string; // "2026-08-01"
  isConfirmed: boolean;
  userA: SettlementUserSummary;
  userB: SettlementUserSummary;
  settlementFromUserId: string;
  settlementToUserId: string;
  settlementAmount: number;
  confirmedAt: string | null;
  reopenedAt: string | null;
};
