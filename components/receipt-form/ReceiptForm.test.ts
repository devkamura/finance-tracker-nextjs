import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildOcrItem, resolveOccurredMonth } from "@/components/receipt-form/ReceiptForm";
import type { MasterData, OcrReceiptItem } from "@/types/receipt";

const CONSUMPTION_TAXES: MasterData["consumptionTaxes"] = [
  { id: 1, name: "8%", multiplier: 1.08 },
  { id: 2, name: "10%", multiplier: 1.1 },
];

function buildOcrReceiptItem(
  overrides: Partial<OcrReceiptItem> = {}
): OcrReceiptItem {
  return {
    name: "テスト商品",
    price: 1000,
    taxRatePercent: 8,
    ...overrides,
  };
}

describe("buildOcrItem", () => {
  it("税区分は税別を既定値とし、価格はOCRの数値をそのまま使う（税込換算しない）", () => {
    const item = buildOcrItem(
      buildOcrReceiptItem({ price: 1000, taxRatePercent: 8 }),
      CONSUMPTION_TAXES
    );

    expect(item.taxType).toBe("exclusive");
    expect(item.price).toBe("1000");
    expect(item.taxRateId).toBe("1");
  });

  it("推定税率が10%の場合は10%のマスタIDを選択状態にする", () => {
    const item = buildOcrItem(
      buildOcrReceiptItem({ taxRatePercent: 10 }),
      CONSUMPTION_TAXES
    );

    expect(item.taxRateId).toBe("2");
  });

  it("税率が推定できない場合は税別のまま税率を未選択にする", () => {
    const item = buildOcrItem(
      buildOcrReceiptItem({ taxRatePercent: null }),
      CONSUMPTION_TAXES
    );

    expect(item.taxType).toBe("exclusive");
    expect(item.taxRateId).toBe("");
  });
});

describe("resolveOccurredMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15)); // 2026-10-15（ローカル時刻）
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("datetimeが入力されていればその年月を返す", () => {
    expect(resolveOccurredMonth("2026-09-05T12:00")).toBe("2026-09");
  });

  it("datetimeが未入力の場合は現在時刻の年月を返す", () => {
    expect(resolveOccurredMonth("")).toBe("2026-10");
  });
});
