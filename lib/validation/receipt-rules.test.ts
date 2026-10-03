import { describe, expect, it } from "vitest";

import { OWNER_JOINT_VALUE } from "@/lib/constants";
import type { CategoryBreakdown } from "@/lib/receipts/breakdowns";
import type { Counterpart, Tag } from "@/lib/receipts/labels";
import { validateReceiptForm as validateWithLabels } from "@/lib/validation/receipt-rules";
import type { ReceiptFormState, ReceiptItem } from "@/types/receipt";

const USER_A = "user-a";
const USER_B = "user-b";
const MEMBER_USER_IDS = [USER_A, USER_B];
const NO_BREAKDOWNS: CategoryBreakdown[] = [];

// グループの相手・タグ（id 2 の相手・id 6 のタグは非表示）
const COUNTERPARTS: Counterpart[] = [
  { id: 1, kind: "default", userId: null, name: "ふたり", isHidden: false },
  { id: 2, kind: "default", userId: null, name: "実家", isHidden: true },
];
const TAGS: Tag[] = [
  { id: 5, name: "朝食", isHidden: false },
  { id: 6, name: "旧タグ", isHidden: true },
];

// 相手・タグを省略したときは上の値で検証する
function validateReceiptForm(
  state: ReceiptFormState,
  memberUserIds: string[],
  breakdowns: CategoryBreakdown[],
  labels = { counterparts: COUNTERPARTS, tags: TAGS }
) {
  return validateWithLabels(state, memberUserIds, breakdowns, labels);
}

function buildItem(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    clientId: "1",
    name: "テスト商品",
    price: "100",
    taxType: "inclusive",
    taxRateId: "",
    categoryId: "1",
    breakdownId: "",
    counterpartId: "1",
    tagIds: [],
    ownerUserId: OWNER_JOINT_VALUE,
    ...overrides,
  };
}

function buildState(overrides: Partial<ReceiptFormState> = {}): ReceiptFormState {
  return {
    payeeSelect: "1",
    payeeInputText: "",
    datetime: "2026-08-29T12:00",
    transactionTypeId: "1",
    amount: "100",
    payerUserId: "user-a",
    items: [buildItem()],
    ...overrides,
  };
}

describe("validateReceiptForm", () => {
  it("returns no errors for a valid form", () => {
    const result = validateReceiptForm(buildState(), MEMBER_USER_IDS, NO_BREAKDOWNS);
    expect(result.errors).toEqual([]);
    expect(result.fieldErrors).toEqual({ items: {} });
  });

  it("requires transactionTypeId", () => {
    const result = validateReceiptForm(
      buildState({ transactionTypeId: "" }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toContain("支出 / 返金は必須です。");
    expect(result.fieldErrors.transactionTypeId).toBe(true);
  });

  it("requires amount", () => {
    const result = validateReceiptForm(
      buildState({ amount: "" }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toContain("合計金額は必須です。");
    expect(result.fieldErrors.amount).toBe(true);
  });

  it("requires at least one item", () => {
    expect(
      validateReceiptForm(buildState({ items: [] }), MEMBER_USER_IDS, NO_BREAKDOWNS).errors
    ).toContain("レシート項目を1件以上入力してください。");
  });

  it("requires item price", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ price: "" })] }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toContain("項目1: 価格は必須です。");
    expect(result.fieldErrors.items["1"]?.price).toBe(true);
  });

  it("rejects a non-numeric item price", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ price: "abc" })] }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toContain("項目1: 価格は数値でなければなりません。");
    expect(result.fieldErrors.items["1"]?.price).toBe(true);
  });

  it("requires a tax rate when taxType is exclusive", () => {
    const result = validateReceiptForm(
      buildState({
        items: [buildItem({ taxType: "exclusive", taxRateId: "" })],
      }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toContain("項目1: 税別の場合は税率が必須です。");
    expect(result.fieldErrors.items["1"]?.taxRateId).toBe(true);
  });

  it("does not require a tax rate when taxType is inclusive", () => {
    const result = validateReceiptForm(
      buildState({
        items: [buildItem({ taxType: "inclusive", taxRateId: "" })],
      }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).not.toContain("項目1: 税別の場合は税率が必須です。");
    expect(result.fieldErrors.items["1"]?.taxRateId).toBeUndefined();
  });

  it("requires item categoryId, counterpartId", () => {
    const result = validateReceiptForm(
      buildState({
        items: [buildItem({ categoryId: "", counterpartId: "" })],
      }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "項目1: カテゴリーは必須です。",
        "項目1: 相手は必須です。",
      ])
    );
    expect(result.fieldErrors.items["1"]?.categoryId).toBe(true);
    expect(result.fieldErrors.items["1"]?.counterpartId).toBe(true);
  });

  it("allows an owner of the joint sentinel value", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: OWNER_JOINT_VALUE })] }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toEqual([]);
  });

  it("allows an owner that is a group member", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: USER_B })] }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toEqual([]);
  });

  it("rejects an owner that is not a group member", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: "someone-else" })] }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toContain("項目1: 帰属先が不正です。");
    expect(result.fieldErrors.items["1"]?.ownerUserId).toBe(true);
  });

  it("requires an owner to be selected", () => {
    const result = validateReceiptForm(
      buildState({ items: [buildItem({ ownerUserId: "" })] }),
      MEMBER_USER_IDS, NO_BREAKDOWNS
    );
    expect(result.errors).toContain("項目1: 帰属先は必須です。");
    expect(result.fieldErrors.items["1"]?.ownerUserId).toBe(true);
  });

  describe("内訳（docs/分析拡充/基本設計書.md 3.1節）", () => {
    const breakdowns: CategoryBreakdown[] = [
      { id: 10, categoryId: 1, name: "外食", isHidden: false },
      { id: 11, categoryId: 1, name: "旧内訳", isHidden: true },
      { id: 20, categoryId: 2, name: "ガス", isHidden: false },
    ];

    it("U-93: 内訳を設定したカテゴリで内訳が未選択なら「内訳は必須です。」", () => {
      const result = validateReceiptForm(
        buildState({ items: [buildItem({ categoryId: "1", breakdownId: "" })] }),
        MEMBER_USER_IDS,
        breakdowns
      );
      expect(result.errors).toContain("項目1: 内訳は必須です。");
      expect(result.fieldErrors.items["1"]?.breakdownId).toBe(true);
    });

    it("U-93: 別のカテゴリの内訳・存在しない内訳は「内訳が不正です。」", () => {
      for (const breakdownId of ["20", "999"]) {
        const result = validateReceiptForm(
          buildState({ items: [buildItem({ categoryId: "1", breakdownId })] }),
          MEMBER_USER_IDS,
          breakdowns
        );
        expect(result.errors).toContain("項目1: 内訳が不正です。");
      }
    });

    it("U-93: 正しい内訳、非表示でも既存の内訳、内訳のないカテゴリはエラーにならない", () => {
      for (const item of [
        buildItem({ categoryId: "1", breakdownId: "10" }),
        buildItem({ categoryId: "1", breakdownId: "11" }),
        buildItem({ categoryId: "3", breakdownId: "" }),
      ]) {
        const result = validateReceiptForm(buildState({ items: [item] }), MEMBER_USER_IDS, breakdowns);
        expect(result.errors).toEqual([]);
      }
    });
  });

  describe("相手・タグ（docs/分析拡充/基本設計書.md 3.3節）", () => {
    it("U-101: グループにない相手は「相手が不正です。」", () => {
      const result = validateReceiptForm(
        buildState({ items: [buildItem({ counterpartId: "999" })] }),
        MEMBER_USER_IDS,
        NO_BREAKDOWNS
      );
      expect(result.errors).toContain("項目1: 相手が不正です。");
      expect(result.fieldErrors.items["1"]?.counterpartId).toBe(true);
    });

    it("U-101: グループにないタグが含まれていれば「タグが不正です。」", () => {
      const result = validateReceiptForm(
        buildState({ items: [buildItem({ tagIds: ["5", "999"] })] }),
        MEMBER_USER_IDS,
        NO_BREAKDOWNS
      );
      expect(result.errors).toContain("項目1: タグが不正です。");
      expect(result.fieldErrors.items["1"]?.tagIds).toBe(true);
    });

    it("U-101: 非表示でも既存の相手・タグ、タグなしはエラーにならない", () => {
      for (const item of [
        buildItem({ counterpartId: "2", tagIds: ["6"] }),
        buildItem({ counterpartId: "1", tagIds: ["5"] }),
        buildItem({ counterpartId: "1", tagIds: [] }),
      ]) {
        const result = validateReceiptForm(buildState({ items: [item] }), MEMBER_USER_IDS, NO_BREAKDOWNS);
        expect(result.errors).toEqual([]);
      }
    });
  });
});
