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
