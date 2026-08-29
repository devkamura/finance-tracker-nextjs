import { describe, expect, it } from "vitest";

import { validateReceiptForm } from "@/lib/validation/receipt-rules";
import type { ReceiptFormState, ReceiptItem } from "@/types/receipt";

function buildItem(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    clientId: "1",
    name: "テスト商品",
    price: "100",
    taxRateId: "1",
    categoryId: "1",
    purposeId: "1",
    sceneIds: [],
    ...overrides,
  };
}

function buildState(overrides: Partial<ReceiptFormState> = {}): ReceiptFormState {
  return {
    storeSelect: "1",
    storeInputText: "",
    datetime: "2026-08-29T12:00",
    transactionTypeId: "1",
    amount: "100",
    items: [buildItem()],
    ...overrides,
  };
}

describe("validateReceiptForm", () => {
  it("returns no errors for a valid form", () => {
    expect(validateReceiptForm(buildState())).toEqual([]);
  });

  it("requires transactionTypeId", () => {
    expect(validateReceiptForm(buildState({ transactionTypeId: "" }))).toContain(
      "支出 / 返金は必須です。"
    );
  });

  it("requires amount", () => {
    expect(validateReceiptForm(buildState({ amount: "" }))).toContain(
      "合計金額は必須です。"
    );
  });

  it("requires at least one item", () => {
    expect(validateReceiptForm(buildState({ items: [] }))).toContain(
      "レシート項目を1件以上入力してください。"
    );
  });

  it("requires item price", () => {
    const errors = validateReceiptForm(
      buildState({ items: [buildItem({ price: "" })] })
    );
    expect(errors).toContain("項目1: 価格は必須です。");
  });

  it("rejects a non-numeric item price", () => {
    const errors = validateReceiptForm(
      buildState({ items: [buildItem({ price: "abc" })] })
    );
    expect(errors).toContain("項目1: 価格は数値でなければなりません。");
  });

  it("requires item taxRateId, categoryId, purposeId", () => {
    const errors = validateReceiptForm(
      buildState({
        items: [buildItem({ taxRateId: "", categoryId: "", purposeId: "" })],
      })
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "項目1: 税率は必須です。",
        "項目1: カテゴリーは必須です。",
        "項目1: 目的は必須です。",
      ])
    );
  });
});
