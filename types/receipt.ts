import type { CategoryBreakdown } from "@/lib/receipts/breakdowns";
import type { Counterpart, Tag } from "@/lib/receipts/labels";
import type { Payee } from "@/lib/receipts/payees";

export type TaxType = "inclusive" | "exclusive";

export type ReceiptItem = {
  clientId: string;
  name: string;
  price: string;
  taxType: TaxType;
  taxRateId: string; // taxTypeが"exclusive"の場合のみ必須
  categoryId: string;
  // 内訳。"" または実際の内訳ID（内訳を設定したカテゴリでは必須。docs/分析拡充/基本設計書.md 3.1節）
  breakdownId: string;
  // 相手（必須。docs/分析拡充/基本設計書.md 3.3節）
  counterpartId: string;
  // タグ（任意・複数）
  tagIds: string[];
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
  // 支払い先（グループ全体・全員の自分用・非表示のものも含む。プルダウンには
  // グループ全体と自分用だけを出し、編集時は保存済みの支払い先も表示するため）
  payees: Payee[];
  transactionTypes: { id: number; name: string }[];
  consumptionTaxes: { id: number; name: string; multiplier: number }[];
  categories: { id: number; name: string }[];
  // カテゴリの内訳（非表示のものも含む。編集時に既存の値を表示するため）
  breakdowns: CategoryBreakdown[];
  // 相手・タグ（非表示のものも含む。編集時に既存の値を表示するため）
  counterparts: Counterpart[];
  tags: Tag[];
  members: GroupMemberOption[];
};

// Gemini APIによるレシート画像の読み取り結果
export type OcrReceiptItem = {
  name: string;
  price: number;
  // 商品名から推定した消費税率。8/10のいずれか、判断できない場合はnull。
  taxRatePercent: 8 | 10 | null;
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
  // 税別明細の税率の倍率（税込は null）。一覧の絞り込みで按分額を計算するのに使う。
  taxRateMultiplier: number | null;
  categoryId: number;
  categoryName: string;
  breakdownId: number | null;
  breakdownName: string | null; // 内訳なしはnull
  // 相手。一覧の絞り込み（相手で絞り込む）で使う（docs/分析拡充/詳細設計書.md F4 4章）
  counterpartId: number;
  counterpartName: string;
  ownerUserId: string | null;
  ownerDisplayName: string; // "共同" またはユーザー表示名
  ownerColor: string | null; // 共同の場合はnull
  tagNames: string[];
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
  // 相方分の同時登録（複製登録）で作られたレシートか。trueの場合は「複製」アイコンを表示する。
  isDuplicated: boolean;
  // 登録者（created_by）の表示名。複製アイコンの説明文「◯◯さんが複製登録」に使う。
  createdByDisplayName: string;
  isLocked: boolean; // 精算確定済み月のため編集・削除不可
  items: ReceiptDetailItemView[];
};

// レシート一覧画面用。一覧のアコーディオンでそのまま明細・画像を確認できるよう、
// 詳細相当の情報も含める（isLockedのみ一覧では取得しない。詳細/編集画面で確認する）。
export type ReceiptListItem = {
  id: string;
  occurredAt: string;
  // 登録済みの支払い先のID。null＝手入力（分析からの支払い先の絞り込みに使う）
  payeeId: number | null;
  payeeName: string;
  amount: number;
  transactionTypeName: string;
  payerUserId: string;
  payerDisplayName: string;
  payerColor: string | null;
  receiptImageUrl: string | null;
  // 相方分の同時登録（複製登録）で作られたレシートか。trueの場合は「複製」アイコンを表示する。
  isDuplicated: boolean;
  // 登録者（created_by）の表示名。複製アイコンの説明文「◯◯さんが複製登録」に使う。
  createdByDisplayName: string;
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
