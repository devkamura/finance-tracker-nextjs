import { describe, expect, it } from "vitest";

import { buildPieData, formatYen, sumByCategory } from "@/lib/analytics/aggregate";
import type { AnalyticsRow } from "@/lib/analytics/types";

const USER_A = "user-a";
const USER_B = "user-b";
const FOOD = 1;
const DAILY = 2;
const CLOTHES = 3;

const row = (
  categoryId: number,
  ownerUserId: string | null,
  amount: number,
  month = "2026-09"
): AnalyticsRow => ({ month, categoryId, ownerUserId, amount });

// 共同の食費10,000円、Aの食費3,000円、Bの食費2,000円（基本設計書の例）
const rows: AnalyticsRow[] = [
  row(FOOD, null, 10000),
  row(FOOD, USER_A, 3000),
  row(FOOD, USER_B, 2000),
  row(DAILY, USER_A, 500),
  row(FOOD, null, 99999, "2026-08"), // 別の月
];

describe("sumByCategory", () => {
  it("U-68: 全体はすべての帰属先を合計する", () => {
    expect(sumByCategory(rows, { kind: "all" }, "2026-09")).toEqual([
      { categoryId: FOOD, amount: 15000 },
      { categoryId: DAILY, amount: 500 },
    ]);
  });

  it("U-68: ユーザー（共同オフ）は帰属先が本人の行だけを合計する", () => {
    expect(
      sumByCategory(rows, { kind: "user", userId: USER_B, includeJoint: false }, "2026-09")
    ).toEqual([{ categoryId: FOOD, amount: 2000 }]);
  });

  it("U-69: 共同オンでは共同の行を1/2で加算し、A＋Bが全体と一致する", () => {
    const a = sumByCategory(rows, { kind: "user", userId: USER_A, includeJoint: true }, "2026-09");
    const b = sumByCategory(rows, { kind: "user", userId: USER_B, includeJoint: true }, "2026-09");
    expect(a).toEqual([
      { categoryId: FOOD, amount: 8000 },
      { categoryId: DAILY, amount: 500 },
    ]);
    expect(b).toEqual([{ categoryId: FOOD, amount: 7000 }]);
  });

  it("U-69: 共同の奇数円で出る0.5円は丸めずにそのまま残る", () => {
    const odd = [row(FOOD, null, 1001)];
    const a = sumByCategory(odd, { kind: "user", userId: USER_A, includeJoint: true }, "2026-09");
    const b = sumByCategory(odd, { kind: "user", userId: USER_B, includeJoint: true }, "2026-09");
    expect(a[0].amount).toBe(500.5);
    expect(a[0].amount + b[0].amount).toBe(1001);
  });
});

describe("buildPieData", () => {
  // 9月：食費30,000円−返金2,000円、日用品10,000円、衣類−8,000円（基本設計書3.7節の例）
  const sums = [
    { categoryId: FOOD, amount: 28000 },
    { categoryId: DAILY, amount: 10000 },
    { categoryId: CLOTHES, amount: -8000 },
  ];

  it("U-70: プラスのカテゴリだけが扇になり、％の分母はプラスのカテゴリの合計になる", () => {
    const pie = buildPieData(sums);
    expect(pie.slices).toEqual([
      { categoryId: FOOD, amount: 28000, percent: 73.7 },
      { categoryId: DAILY, amount: 10000, percent: 26.3 },
    ]);
    expect(pie.positiveTotal).toBe(38000);
  });

  it("U-71: マイナスのカテゴリは注意書き用に分かれ、合計は実際の金額になる", () => {
    const pie = buildPieData(sums);
    expect(pie.negatives).toEqual([{ categoryId: CLOTHES, amount: -8000 }]);
    expect(pie.total).toBe(30000);
  });

  it("U-71: マイナスがなければ注意書き用のリストは空で、分母と合計が一致する", () => {
    const pie = buildPieData([{ categoryId: FOOD, amount: 1000 }]);
    expect(pie.negatives).toEqual([]);
    expect(pie.positiveTotal).toBe(pie.total);
  });

  it("U-72: 明細のない月は扇も合計も空になる", () => {
    const pie = buildPieData(sumByCategory(rows, { kind: "all" }, "2026-07"));
    expect(pie).toEqual({
      slices: [],
      negatives: [],
      zeroCategories: [],
      total: 0,
      positiveTotal: 0,
    });
  });

  it("合計がちょうど0円のカテゴリは表示用に分かれる", () => {
    const pie = buildPieData([
      { categoryId: FOOD, amount: 1000 },
      { categoryId: DAILY, amount: 0 },
    ]);
    expect(pie.zeroCategories).toEqual([{ categoryId: DAILY, amount: 0 }]);
  });
});

describe("formatYen", () => {
  it("整数は小数なし、0.5円は小数第1位まで、マイナスは「−」で表示する", () => {
    expect(formatYen(5200)).toBe("5,200円");
    expect(formatYen(8500.5)).toBe("8,500.5円");
    expect(formatYen(-8000)).toBe("−8,000円");
    expect(formatYen(0)).toBe("0円");
  });
});
