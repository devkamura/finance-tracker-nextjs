import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyOcrPatch,
  buildOcrItem,
  buildOcrPatch,
  resolveOccurredMonth,
} from "@/components/receipt-form/ReceiptForm";
import { SELECT_NONE_VALUE } from "@/lib/constants";
import { EMPTY_PAYEE_DEFAULTS, type Payee } from "@/lib/receipts/payees";
import type {
  MasterData,
  OcrReceiptItem,
  OcrReceiptResult,
  ReceiptFormState,
  ReceiptItem,
} from "@/types/receipt";

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

// 分析拡充 F5：画像読み取りの支払い先（名前・別名で一致）と既定値
describe("画像読み取りの支払い先", () => {
  const USER_A = "user-a";
  const payee = (overrides: Partial<Payee>): Payee => ({
    id: 1,
    name: "オーケー",
    ownerUserId: null,
    isHidden: false,
    defaults: EMPTY_PAYEE_DEFAULTS,
    aliases: [],
    ...overrides,
  });
  const payees = [
    payee({ id: 1, name: "オーケー", aliases: [{ id: 11, name: "オーケー長津田店" }] }),
    payee({ id: 2, name: "△△書店", ownerUserId: "user-b", aliases: [{ id: 21, name: "△△書店 駅前" }] }),
  ];
  const ocr = (payeeName: string | null, items: OcrReceiptItem[] = []): OcrReceiptResult => ({
    payeeName,
    datetime: null,
    totalPrice: null,
    items,
  });

  it("U-130: 読み取った店名が支払い先の名前か別名と一致したら、その支払い先を選ぶ", () => {
    expect(buildOcrPatch(ocr("オーケー長津田店"), payees, CONSUMPTION_TAXES, USER_A)).toMatchObject({
      payeeSelect: "1",
      payeeInputText: "",
    });
    expect(buildOcrPatch(ocr("オーケー"), payees, CONSUMPTION_TAXES, USER_A)).toMatchObject({
      payeeSelect: "1",
    });
  });

  it("U-130: 一致しない店名・相方の自分用の別名は手入力欄に入れる", () => {
    for (const name of ["オーケー長津田", "△△書店 駅前"]) {
      expect(buildOcrPatch(ocr(name), payees, CONSUMPTION_TAXES, USER_A)).toMatchObject({
        payeeSelect: SELECT_NONE_VALUE,
        payeeInputText: name,
      });
    }
  });

  const baseItem: ReceiptItem = {
    clientId: "1",
    name: "牛乳",
    price: "200",
    taxType: "exclusive",
    taxRateId: "1",
    categoryId: "",
    breakdownId: "",
    counterpartId: "",
    tagIds: [],
    ownerUserId: "",
  };
  const prev: ReceiptFormState = {
    payeeSelect: "",
    payeeInputText: "",
    datetime: "",
    transactionTypeId: "1",
    amount: "",
    payerUserId: "",
    items: [{ ...baseItem, clientId: "prev", name: "入力中の明細" }],
  };
  // 支払い先の既定値を入れる処理の代わりに、どの支払い先で呼ばれたかを記録する
  const withDefaults = vi.fn((item: ReceiptItem, payeeSelect: string) => ({
    ...item,
    categoryId: `default-of-${payeeSelect}`,
  }));

  beforeEach(() => {
    withDefaults.mockClear();
  });

  it("U-130: 支払い先が選ばれたら、読み取った明細（なければ入力中の明細）に既定値を入れる", () => {
    const withItems = applyOcrPatch(
      prev,
      { payeeSelect: "1", payeeInputText: "", items: [{ ...baseItem, clientId: "a" }, { ...baseItem, clientId: "b" }] },
      withDefaults
    );
    expect(withItems.items.map((i) => i.categoryId)).toEqual(["default-of-1", "default-of-1"]);

    const withoutItems = applyOcrPatch(prev, { payeeSelect: "1", payeeInputText: "" }, withDefaults);
    expect(withoutItems.items).toEqual([
      { ...prev.items[0], categoryId: "default-of-1" },
    ]);
  });

  it("U-130: 手入力欄に入った場合・店名が読み取れなかった場合は既定値を入れない", () => {
    const manual = applyOcrPatch(
      prev,
      { payeeSelect: SELECT_NONE_VALUE, payeeInputText: "知らない店", items: [baseItem] },
      withDefaults
    );
    expect(manual.items).toEqual([baseItem]);
    const noPayee = applyOcrPatch(prev, { amount: "1000" }, withDefaults);
    expect(noPayee).toEqual({ ...prev, amount: "1000" });
    expect(withDefaults).not.toHaveBeenCalled();
  });
});

