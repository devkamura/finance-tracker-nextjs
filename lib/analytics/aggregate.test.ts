import { describe, expect, it } from "vitest";

import {
  buildPieData,
  buildTrendData,
  formatYen,
  sumByDimension,
  sumByMonth,
} from "@/lib/analytics/aggregate";
import { costTypeMap } from "@/lib/analytics/dimensions";
import type { AnalyticsRow, Scope } from "@/lib/analytics/types";

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
): AnalyticsRow => ({
  month,
  categoryId,
  breakdownId: null,
  counterpartId: 1,
  payeeId: 1,
  ownerUserId,
  amount,
});

const costTypes = costTypeMap([
  { id: FOOD, costType: "variable" },
  { id: DAILY, costType: "variable" },
  { id: CLOTHES, costType: "variable" },
]);

// カテゴリで分け、絞り込みなし（F4 より前のカテゴリ別集計と同じ）
const sumByCategory = (target: AnalyticsRow[], scope: Scope, month: string) =>
  sumByDimension(target, scope, month, "category", {}, costTypes);

const key = (id: number) => String(id);

// 共同の食費10,000円、Aの食費3,000円、Bの食費2,000円（基本設計書の例）
const rows: AnalyticsRow[] = [
  row(FOOD, null, 10000),
  row(FOOD, USER_A, 3000),
  row(FOOD, USER_B, 2000),
  row(DAILY, USER_A, 500),
  row(FOOD, null, 99999, "2026-08"), // 別の月
];

describe("sumByDimension（カテゴリで分ける）", () => {
  it("U-68: 全体はすべての帰属先を合計する", () => {
    expect(sumByCategory(rows, { kind: "all" }, "2026-09")).toEqual([
      { key: key(FOOD), amount: 15000 },
      { key: key(DAILY), amount: 500 },
    ]);
  });

  it("U-68: ユーザー（共同オフ）は帰属先が本人の行だけを合計する", () => {
    expect(
      sumByCategory(rows, { kind: "user", userId: USER_B, includeJoint: false }, "2026-09")
    ).toEqual([{ key: key(FOOD), amount: 2000 }]);
  });

  it("U-69: 共同オンでは共同の行を1/2で加算し、A＋Bが全体と一致する", () => {
    const a = sumByCategory(rows, { kind: "user", userId: USER_A, includeJoint: true }, "2026-09");
    const b = sumByCategory(rows, { kind: "user", userId: USER_B, includeJoint: true }, "2026-09");
    expect(a).toEqual([
      { key: key(FOOD), amount: 8000 },
      { key: key(DAILY), amount: 500 },
    ]);
    expect(b).toEqual([{ key: key(FOOD), amount: 7000 }]);
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
    { key: key(FOOD), amount: 28000 },
    { key: key(DAILY), amount: 10000 },
    { key: key(CLOTHES), amount: -8000 },
  ];

  it("U-70: プラスのカテゴリだけが扇になり、％の分母はプラスのカテゴリの合計になる", () => {
    const pie = buildPieData(sums);
    expect(pie.slices).toEqual([
      { key: key(FOOD), amount: 28000, percent: 73.7 },
      { key: key(DAILY), amount: 10000, percent: 26.3 },
    ]);
    expect(pie.positiveTotal).toBe(38000);
  });

  it("U-71: マイナスのカテゴリは注意書き用に分かれ、合計は実際の金額になる", () => {
    const pie = buildPieData(sums);
    expect(pie.negatives).toEqual([{ key: key(CLOTHES), amount: -8000 }]);
    expect(pie.total).toBe(30000);
  });

  it("U-71: マイナスがなければ注意書き用のリストは空で、分母と合計が一致する", () => {
    const pie = buildPieData([{ key: key(FOOD), amount: 1000 }]);
    expect(pie.negatives).toEqual([]);
    expect(pie.positiveTotal).toBe(pie.total);
  });

  it("U-72: 明細のない月は扇も合計も空になる", () => {
    const pie = buildPieData(sumByCategory(rows, { kind: "all" }, "2026-07"));
    expect(pie).toEqual({
      slices: [],
      negatives: [],
      zeroKeys: [],
      total: 0,
      positiveTotal: 0,
    });
  });

  it("合計がちょうど0円のカテゴリは表示用に分かれる", () => {
    const pie = buildPieData([
      { key: key(FOOD), amount: 1000 },
      { key: key(DAILY), amount: 0 },
    ]);
    expect(pie.zeroKeys).toEqual([{ key: key(DAILY), amount: 0 }]);
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

describe("sumByMonth", () => {
  const months = ["2026-07", "2026-08", "2026-09"];
  const trendRows: AnalyticsRow[] = [
    row(FOOD, null, 1000, "2026-07"),
    row(DAILY, USER_A, 300, "2026-07"),
    row(FOOD, USER_B, 2000, "2026-09"),
    row(FOOD, null, 501, "2026-09"),
    row(FOOD, null, 99999, "2025-01"), // 対象の12ヶ月以外
  ];

  it("U-76: 総支出は月ごとの合計を古い順に返し、データのない月は0円になる", () => {
    expect(sumByMonth(trendRows, { kind: "all" }, months, {}, costTypes)).toEqual([
      { month: "2026-07", amount: 1300 },
      { month: "2026-08", amount: 0 },
      { month: "2026-09", amount: 2501 },
    ]);
  });

  it("U-77: カテゴリを指定すると、そのカテゴリだけが合計される", () => {
    expect(sumByMonth(trendRows, { kind: "all" }, months, { category: key(DAILY) }, costTypes)).toEqual([
      { month: "2026-07", amount: 300 },
      { month: "2026-08", amount: 0 },
      { month: "2026-09", amount: 0 },
    ]);
  });

  it("U-78: ユーザーの表示対象では帰属先と共同の1/2が効く", () => {
    expect(
      sumByMonth(trendRows, { kind: "user", userId: USER_B, includeJoint: false }, months, {}, costTypes)
    ).toEqual([
      { month: "2026-07", amount: 0 },
      { month: "2026-08", amount: 0 },
      { month: "2026-09", amount: 2000 },
    ]);
    expect(
      sumByMonth(trendRows, { kind: "user", userId: USER_B, includeJoint: true }, months, {}, costTypes)
    ).toEqual([
      { month: "2026-07", amount: 500 },
      { month: "2026-08", amount: 0 },
      { month: "2026-09", amount: 2250.5 },
    ]);
  });
});

describe("buildTrendData", () => {
  const series = (...amounts: number[]) =>
    amounts.map((amount, i) => ({ month: `2026-0${i + 1}`, amount }));

  it("U-79: 前月比は 当月 ÷ 前月 × 100 を小数第1位で四捨五入する", () => {
    const { points } = buildTrendData(series(30000, 5001, 6000, 6000));
    expect(points.map((p) => p.mom)).toEqual([null, 16.7, 120, 100]);
  });

  it("U-80: 最初の月・前月が0円・前月がマイナスの月は前月比を出さない", () => {
    const { points } = buildTrendData(series(1000, 0, 500, -3000, 30000));
    // 1月：最初の月、2月：0÷1000=0%、3月：前月0円、4月：当月マイナス、5月：前月マイナス
    expect(points.map((p) => p.mom)).toEqual([null, 0, null, null, null]);
  });

  it("U-81: マイナスの月は棒が0になり、金額はそのまま、注意書き用の一覧に入り、前月比は出ない", () => {
    const { points, negatives } = buildTrendData(series(10000, -1000));
    expect(points[1]).toEqual({ month: "2026-02", amount: -1000, barValue: 0, mom: null });
    expect(points[0].barValue).toBe(10000);
    expect(negatives).toEqual([{ month: "2026-02", amount: -1000 }]);
  });
});

// 分析拡充 F4：「分ける」「絞り込み」（要件定義書 4.6節の例）
describe("sumByDimension（分ける・絞り込み）", () => {
  const UTILITY = 4; // 水道光熱費（固定費）
  const MEDICAL = 5; // 医療費
  const EATING_OUT = 11; // 食費 ＞ 外食
  const COOKING = 12; // 食費 ＞ 自炊
  const PAIR = 21; // ふたり
  const FRIEND = 22; // 友人
  // 支払い先（登録済みのID）。B薬局は手入力（登録外）
  const IZAKAYA = 31;
  const SUPER = 32;
  const CONVENIENCE = 33;
  const TOKYOGAS = 34;
  const HOSPITAL_A = 35;

  const f4Row = (
    categoryId: number,
    breakdownId: number | null,
    counterpartId: number,
    payeeId: number | null,
    ownerUserId: string | null,
    amount: number
  ): AnalyticsRow => ({
    month: "2026-09",
    categoryId,
    breakdownId,
    counterpartId,
    payeeId,
    ownerUserId,
    amount,
  });

  const f4Rows: AnalyticsRow[] = [
    f4Row(FOOD, EATING_OUT, FRIEND, IZAKAYA, null, 3000),
    f4Row(FOOD, COOKING, PAIR, SUPER, null, 5000),
    f4Row(FOOD, null, PAIR, CONVENIENCE, USER_A, 1000), // 内訳なし（F1 より前のレシート）
    f4Row(UTILITY, null, PAIR, TOKYOGAS, null, 8000),
    f4Row(MEDICAL, null, PAIR, HOSPITAL_A, USER_A, 2000),
    f4Row(MEDICAL, null, PAIR, null, USER_B, 500), // B薬局（手入力）
  ];
  const f4CostTypes = costTypeMap([
    { id: FOOD, costType: "variable" },
    { id: UTILITY, costType: "fixed" },
    { id: MEDICAL, costType: "variable" },
  ]);
  const ALL: Scope = { kind: "all" };
  const sum = (
    dimension: Parameters<typeof sumByDimension>[3],
    filter: Parameters<typeof sumByDimension>[4],
    scope: Scope = ALL,
    types = f4CostTypes
  ) => sumByDimension(f4Rows, scope, "2026-09", dimension, filter, types);

  it("U-112: 食費のうち内訳ごと（内訳なしも含む）。％の分母は絞り込み後の合計", () => {
    const sums = sum("breakdown", { category: key(FOOD) });
    expect(sums).toEqual([
      { key: key(COOKING), amount: 5000 },
      { key: key(EATING_OUT), amount: 3000 },
      { key: "none", amount: 1000 },
    ]);
    const pie = buildPieData(sums);
    expect(pie.positiveTotal).toBe(9000);
    expect(pie.slices.map((s) => s.percent)).toEqual([55.6, 33.3, 11.1]);
  });

  it("U-112: 医療費のうち支払い先ごと（手入力の支払い先は登録外にまとめる）", () => {
    expect(sum("payee", { category: key(MEDICAL) })).toEqual([
      { key: key(HOSPITAL_A), amount: 2000 },
      { key: "unregistered", amount: 500 },
    ]);
  });

  it("U-112: 固定費と変動費、固定費のカテゴリ", () => {
    expect(sum("costType", {})).toEqual([
      { key: "variable", amount: 11500 },
      { key: "fixed", amount: 8000 },
    ]);
    expect(sum("category", { costType: "fixed" })).toEqual([
      { key: key(UTILITY), amount: 8000 },
    ]);
  });

  it("U-112: 友人との支出のカテゴリ、食費のうち相手ごと", () => {
    expect(sum("category", { counterpart: key(FRIEND) })).toEqual([
      { key: key(FOOD), amount: 3000 },
    ]);
    expect(sum("counterpart", { category: key(FOOD) })).toEqual([
      { key: key(PAIR), amount: 6000 },
      { key: key(FRIEND), amount: 3000 },
    ]);
  });

  it("U-112: 表示対象（A＋共同1/2）の重みは絞り込み・分けるでも同じ", () => {
    expect(
      sum("breakdown", { category: key(FOOD) }, { kind: "user", userId: USER_A, includeJoint: true })
    ).toEqual([
      { key: key(COOKING), amount: 2500 },
      { key: key(EATING_OUT), amount: 1500 },
      { key: "none", amount: 1000 },
    ]);
  });

  it("U-113: 費用区分は今のカテゴリの設定で集計する（設定を変えると過去の月も新しい区分になる）", () => {
    const allVariable = costTypeMap([
      { id: FOOD, costType: "variable" },
      { id: UTILITY, costType: "variable" },
      { id: MEDICAL, costType: "variable" },
    ]);
    expect(sum("costType", {}, ALL, allVariable)).toEqual([{ key: "variable", amount: 19500 }]);
  });

  it("U-113: 推移グラフも同じ絞り込みで月ごとに合計する", () => {
    expect(
      sumByMonth(f4Rows, ALL, ["2026-08", "2026-09"], { costType: "fixed" }, f4CostTypes)
    ).toEqual([
      { month: "2026-08", amount: 0 },
      { month: "2026-09", amount: 8000 },
    ]);
    expect(
      sumByMonth(f4Rows, ALL, ["2026-09"], { payee: key(HOSPITAL_A) }, f4CostTypes)
    ).toEqual([{ month: "2026-09", amount: 2000 }]);
  });
});
