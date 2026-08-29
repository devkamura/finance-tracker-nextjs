export type ReceiptItem = {
  clientId: string;
  name: string;
  price: string;
  taxRateId: string;
  categoryId: string;
  purposeId: string;
  sceneIds: string[];
};

export type ReceiptFormState = {
  storeSelect: string; // "" | SELECT_NONE_VALUE | 実際のStore ID(文字列)
  storeInputText: string;
  datetime: string; // <input type="datetime-local"> の値
  transactionTypeId: string;
  amount: string;
  items: ReceiptItem[];
};

export type MasterData = {
  stores: { id: number; name: string }[];
  transactionTypes: { id: number; name: string }[];
  consumptionTaxes: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  purposes: { id: number; name: string }[];
  scenes: { id: number; name: string }[];
};

// Gemini APIによるレシート画像の読み取り結果
export type OcrReceiptItem = {
  name: string;
  price: number;
};

export type OcrReceiptResult = {
  storeName: string | null;
  datetime: string | null; // "YYYY-MM-DDTHH:mm" 形式（<input type="datetime-local"> 互換）
  totalPrice: number | null;
  items: OcrReceiptItem[];
};
