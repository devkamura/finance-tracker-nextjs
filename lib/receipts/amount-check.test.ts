import { describe, expect, it } from "vitest";

import { OWNER_JOINT_VALUE } from "@/lib/constants";
import {
  calculateItemsTaxInclusiveTotal,
  isAmountConsistent,
} from "@/lib/receipts/amount-check";
import type { ReceiptItem } from "@/types/receipt";

const TAX_RATES = [
  { id: 1, multiplier: 1.08 },
  { id: 2, multiplier: 1.1 },
];

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

describe("calculateItemsTaxInclusiveTotal", () => {
  it("税込明細はそのまま合計する", () => {
    const items = [
      buildItem({ price: "1000", taxType: "inclusive" }),
      buildItem({ clientId: "2", price: "500", taxType: "inclusive" }),
    ];
    expect(calculateItemsTaxInclusiveTotal(items, TAX_RATES)).toBe(1500);
  });

  it("税別明細は税率を乗じて切り捨てた額を合計する", () => {
    const items = [
      buildItem({ price: "1000", taxType: "exclusive", taxRateId: "1" }), // 1000*1.08=1080
    ];
    expect(calculateItemsTaxInclusiveTotal(items, TAX_RATES)).toBe(1080);
  });

  it("税込・税別が混在していても正しく合計する", () => {
    const items = [
      buildItem({ price: "1000", taxType: "inclusive" }),
      buildItem({
        clientId: "2",
        price: "1000",
        taxType: "exclusive",
        taxRateId: "2",
      }), // 1000*1.10=1100
    ];
    expect(calculateItemsTaxInclusiveTotal(items, TAX_RATES)).toBe(2100);
  });

  it("端数は切り捨てる", () => {
    const items = [
      buildItem({ price: "999", taxType: "exclusive", taxRateId: "1" }), // 999*1.08=1078.92 -> 1078
    ];
    expect(calculateItemsTaxInclusiveTotal(items, TAX_RATES)).toBe(1078);
  });
});

describe("isAmountConsistent", () => {
  it("合計金額と明細合計が一致する場合はtrue", () => {
    const items = [buildItem({ price: "1000", taxType: "inclusive" })];
    expect(isAmountConsistent("1000", items, TAX_RATES)).toBe(true);
  });

  it("合計金額と明細合計が一致しない場合はfalse", () => {
    const items = [buildItem({ price: "1000", taxType: "inclusive" })];
    expect(isAmountConsistent("1500", items, TAX_RATES)).toBe(false);
  });

  it("税別明細を含む場合も税込換算後の合計と比較する", () => {
    const items = [
      buildItem({ price: "1000", taxType: "exclusive", taxRateId: "1" }),
    ];
    expect(isAmountConsistent("1080", items, TAX_RATES)).toBe(true);
    expect(isAmountConsistent("1000", items, TAX_RATES)).toBe(false);
  });
});
