import { describe, expect, it } from "vitest";

import {
  calculateSettlement,
  type SettlementReceiptInput,
} from "@/lib/settlement/calculate";

const USER_A = "user-a";
const USER_B = "user-b";

function receipt(
  overrides: Partial<SettlementReceiptInput> &
    Pick<SettlementReceiptInput, "payerUserId" | "amount" | "details">
): SettlementReceiptInput {
  return { isRefund: false, ...overrides };
}

describe("calculateSettlement", () => {
  it("共同支出は2人で1/2ずつ負担する（要件書15章）", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 10000,
          details: [
            {
              price: 10000,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: null,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    expect(result.burden).toEqual({ [USER_A]: 5000, [USER_B]: 5000 });
    expect(result.paid).toEqual({ [USER_A]: 10000, [USER_B]: 0 });
    expect(result.diff).toEqual({ [USER_A]: 5000, [USER_B]: -5000 });
    expect(result.settlement).toEqual({
      fromUserId: USER_B,
      toUserId: USER_A,
      amount: 5000,
    });
  });

  it("明細合計と実支払額が一致しない場合、支払額を明細比率で按分する（明細金額・実支払額・精算に関する要件4章の例）", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 1500,
          details: [
            {
              price: 1000,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: null,
            },
            {
              price: 1000,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_B,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    // 共同750円→A375/B375、B個人750円→B750。合計 A:375円 B:1125円。
    expect(result.burden).toEqual({ [USER_A]: 375, [USER_B]: 1125 });
    expect(result.paid).toEqual({ [USER_A]: 1500, [USER_B]: 0 });
  });

  it("端数を最大剰余法（金額の大きい明細から1円ずつ）で配分し、合計が支払額と一致する", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 1000,
          details: [
            {
              price: 100,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_A,
            },
            {
              price: 100,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_A,
            },
            {
              price: 100,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_A,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    // 1000÷3の按分：各333円、余り1円は明細1件目（同額なので最初の要素）に加算されて334円。
    expect(result.burden[USER_A]).toBe(1000);
    expect(result.burden[USER_B]).toBe(0);
  });

  it("税別明細は税込換算してから按分する", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 1080,
          details: [
            {
              price: 1000,
              taxType: "exclusive",
              taxRateMultiplier: 1.08,
              ownerUserId: null,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    expect(result.burden).toEqual({ [USER_A]: 540, [USER_B]: 540 });
  });

  it("支払者と帰属先が異なる場合、個人立替額として記録する（要件書18章）", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 5000,
          details: [
            {
              price: 5000,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_B,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    expect(result.advances).toEqual([
      { fromPayerUserId: USER_A, toOwnerUserId: USER_B, amount: 5000 },
    ]);
    expect(result.burden).toEqual({ [USER_A]: 0, [USER_B]: 5000 });
    expect(result.paid).toEqual({ [USER_A]: 5000, [USER_B]: 0 });
  });

  it("返金レシートは金額をマイナスとして集計する", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 3000,
          details: [
            {
              price: 3000,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_A,
            },
          ],
        }),
        receipt({
          payerUserId: USER_A,
          amount: 1000,
          isRefund: true,
          details: [
            {
              price: 1000,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_A,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    expect(result.paid[USER_A]).toBe(2000);
    expect(result.burden[USER_A]).toBe(2000);
  });

  it("明細金額の合計が0円の場合は按分せず0として扱う", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 500,
          details: [
            {
              price: 0,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: null,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    expect(result.burden).toEqual({ [USER_A]: 0, [USER_B]: 0 });
    // 支払額そのものはpayerに全額計上される（17章：明細に依存しない）。
    expect(result.paid).toEqual({ [USER_A]: 500, [USER_B]: 0 });
  });

  it("共同按分で.5円の端数が生じても、精算差額の合計はちょうど0になる（丸め誤差の回帰テスト）", () => {
    // 共同100円・B個人200円を支払額1,000円で按分すると333円/667円になり、
    // 共同分の333円を1/2すると166.5円という.5円の端数が生じる。
    // A・Bを独立にMath.roundすると両方切り上がり、diffの合計が1円ズレていた
    // （修正前バグ）。
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 1000,
          details: [
            {
              price: 100,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: null,
            },
            {
              price: 200,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_B,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    expect(result.diff[USER_A] + result.diff[USER_B]).toBe(0);
    expect(result.burden[USER_A] + result.burden[USER_B]).toBe(
      result.paid[USER_A] + result.paid[USER_B]
    );
  });

  it("精算差額が0の場合はamount 0を返す", () => {
    const result = calculateSettlement(
      [
        receipt({
          payerUserId: USER_A,
          amount: 1000,
          details: [
            {
              price: 1000,
              taxType: "inclusive",
              taxRateMultiplier: null,
              ownerUserId: USER_A,
            },
          ],
        }),
      ],
      USER_A,
      USER_B
    );

    expect(result.settlement).toEqual({
      fromUserId: USER_B,
      toUserId: USER_A,
      amount: 0,
    });
  });
});
