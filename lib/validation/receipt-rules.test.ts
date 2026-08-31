import { describe, expect, it } from "vitest";

import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { validateReceiptForm } from "@/lib/validation/receipt-rules";
import type { ReceiptFormState, ReceiptItem } from "@/types/receipt";

const USER_A = "user-a";
const USER_B = "user-b";
const MEMBER_USER_IDS = [USER_A, USER_B];

function buildItem(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    clientId: "1",
    name: "テスト商品",
    price: "100",
    taxType: "inclusive",
    taxRateId: "",
    categoryId: "1",
    purposeId: "1",
    sceneIds: [],
    ownerUserId: OWNER_JOINT_VALUE,
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
    const result = validateReceiptForm(buildState(), MEMBER_USER_IDS);
    expect(result.errors).toEqual([]);
    expect(result.fieldErrors).toEqual({ items: {} });
  });

  it("requires transactionTypeId", () => {
    const result = validateReceiptForm(
      buildState({ transactionTypeId: "" }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toContain("支出 / 返金は必須です。");
    expect(result.fieldErrors.transactionTypeId).toBe(true);
  });

  it("requires amount", () => {
    const result = validateReceiptForm(
      buildState({ amount: "" }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toContain("合計金額は必須です。");
    expect(result.fieldErrors.amount).toBe(true);
  });

  it("requires at least one item", () => {
    expect(
      validateReceiptForm(buildState({ items: [] }), MEMBER_USER_IDS).errors
    ).toContain("レシート項目を1件以上入力してください。");
  });

  it("requires item price", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ price: "" })] }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toContain("項目1: 価格は必須です。");
    expect(result.fieldErrors.items["1"]?.price).toBe(true);
  });

  it("rejects a non-numeric item price", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ price: "abc" })] }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toContain("項目1: 価格は数値でなければなりません。");
    expect(result.fieldErrors.items["1"]?.price).toBe(true);
  });

  it("requires a tax rate when taxType is exclusive", () => {
    const result = validateReceiptForm(
      buildState({
        items: [buildItem({ taxType: "exclusive", taxRateId: "" })],
      }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toContain("項目1: 税別の場合は税率が必須です。");
    expect(result.fieldErrors.items["1"]?.taxRateId).toBe(true);
  });

  it("does not require a tax rate when taxType is inclusive", () => {
    const result = validateReceiptForm(
      buildState({
        items: [buildItem({ taxType: "inclusive", taxRateId: "" })],
      }),
      MEMBER_USER_IDS
    );
    expect(result.errors).not.toContain("項目1: 税別の場合は税率が必須です。");
    expect(result.fieldErrors.items["1"]?.taxRateId).toBeUndefined();
  });

  it("requires item categoryId, purposeId", () => {
    const result = validateReceiptForm(
      buildState({
        items: [buildItem({ categoryId: "", purposeId: "" })],
      }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "項目1: カテゴリーは必須です。",
        "項目1: 目的は必須です。",
      ])
    );
    expect(result.fieldErrors.items["1"]?.categoryId).toBe(true);
    expect(result.fieldErrors.items["1"]?.purposeId).toBe(true);
  });

  it("allows an owner of the joint sentinel value", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: OWNER_JOINT_VALUE })] }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toEqual([]);
  });

  it("allows an owner that is a group member", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: USER_B })] }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toEqual([]);
  });

  it("rejects an owner that is not a group member", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: "someone-else" })] }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toContain("項目1: 帰属先が不正です。");
    expect(result.fieldErrors.items["1"]?.ownerUserId).toBe(true);
  });

  it("requires an owner to be selected", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: "" })] }),
      MEMBER_USER_IDS
    );
    expect(result.errors).toContain("項目1: 帰属先は必須です。");
    expect(result.fieldErrors.items["1"]?.ownerUserId).toBe(true);
  });
});
