// 単体テスト：登録・編集画面の特別費フラグと保存（Issue #41）。

import { describe, expect, it } from "vitest";

import { applyBulkInput, buildOcrItem } from "@/components/receipt-form/ReceiptForm";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { buildPartnerItems } from "@/lib/receipts/duplicate";
import { buildReceiptDetailRows } from "@/lib/receipts/shared";
import { specialExpenseReceiptLabel } from "@/lib/receipts/special-expense-label";
import type { ReceiptItem } from "@/types/receipt";

function buildItem(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    clientId: "1",
    name: "牛乳",
    price: "200",
    taxType: "inclusive",
    taxRateId: "",
    categoryId: "1",
    breakdownId: "",
    counterpartId: "21",
    tagIds: [],
    ownerUserId: OWNER_JOINT_VALUE,
    isSpecialExpense: false,
    ...overrides,
  };
}

describe("特別費フラグ（登録・編集画面）", () => {
  it("U-158: 一括入力で「特別費にする／しない」を選んだときだけ全項目が変わる", () => {
    const items = [buildItem({ clientId: "1" }), buildItem({ clientId: "2", isSpecialExpense: true })];

    const on = items.map((item) => applyBulkInput(item, { isSpecialExpense: true }, []));
    expect(on.map((i) => i.isSpecialExpense)).toEqual([true, true]);

    const off = on.map((item) => applyBulkInput(item, { isSpecialExpense: false }, []));
    expect(off.map((i) => i.isSpecialExpense)).toEqual([false, false]);

    // 「変更しない」（指定なし）は各項目の値を変えない。ほかの項目だけの一括入力でも同じ
    const unchanged = items.map((item) => applyBulkInput(item, {}, []));
    expect(unchanged.map((i) => i.isSpecialExpense)).toEqual([false, true]);
    const ownerOnly = items.map((item) => applyBulkInput(item, { ownerUserId: "user-a" }, []));
    expect(ownerOnly.map((i) => [i.ownerUserId, i.isSpecialExpense])).toEqual([
      ["user-a", false],
      ["user-a", true],
    ]);
    // 元の項目は書き換えない
    expect(items[0].isSpecialExpense).toBe(false);
  });

  it("U-158: OCR で読み取った明細は通常（チェックなし）", () => {
    expect(buildOcrItem({ name: "お土産", price: 1000, taxRatePercent: 8 }, []).isSpecialExpense).toBe(false);
  });

  it("U-158: 保存する行の is_special_expense は true のときだけ true（未指定・不正な値は false）", () => {
    const rows = buildReceiptDetailRows(
      [
        buildItem({ isSpecialExpense: true }),
        buildItem({ isSpecialExpense: false }),
        { ...buildItem(), isSpecialExpense: undefined } as unknown as ReceiptItem,
        { ...buildItem(), isSpecialExpense: "true" } as unknown as ReceiptItem,
      ],
      "receipt-1"
    );
    expect(rows.map((r) => r.is_special_expense)).toEqual([true, false, false, false]);
  });

  it("U-158: 複製登録でもフラグを引き継ぐ", () => {
    const items = buildPartnerItems(
      [buildItem({ ownerUserId: "me", isSpecialExpense: true }), buildItem({ isSpecialExpense: false })],
      "me",
      "partner"
    );
    expect(items.map((i) => i.isSpecialExpense)).toEqual([true, false]);
  });
});

describe("レシート単位の特別費の印（一覧の行・詳細の見出し）", () => {
  it("U-163: すべて特別費 →「特別費」、一部 →「特別費あり」、なし・明細なし → 出さない", () => {
    const flag = (v: boolean) => ({ isSpecialExpense: v });
    expect(specialExpenseReceiptLabel([flag(true)])).toBe("特別費");
    expect(specialExpenseReceiptLabel([flag(true), flag(true)])).toBe("特別費");
    expect(specialExpenseReceiptLabel([flag(true), flag(false)])).toBe("特別費あり");
    expect(specialExpenseReceiptLabel([flag(false), flag(false)])).toBeNull();
    expect(specialExpenseReceiptLabel([])).toBeNull();
  });
});
