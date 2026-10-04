import { describe, expect, it } from "vitest";

import {
  autoBreakdownIdFor,
  breakdownIdAfterBulkApply,
  isBreakdownOfCategory,
  isBreakdownRequired,
  visibleBreakdownsFor,
  type CategoryBreakdown,
} from "@/lib/receipts/breakdowns";

const FOOD = 1;
const UTILITIES = 2;
const OTHER = 3;

const breakdowns: CategoryBreakdown[] = [
  { id: 10, categoryId: FOOD, name: "外食", isHidden: false },
  { id: 11, categoryId: FOOD, name: "自炊", isHidden: false },
  { id: 12, categoryId: FOOD, name: "旧内訳", isHidden: true },
  { id: 20, categoryId: UTILITIES, name: "ガス", isHidden: false },
  { id: 30, categoryId: OTHER, name: "非表示のみ", isHidden: true },
];

describe("breakdowns", () => {
  it("U-92: 選択肢には、そのカテゴリの非表示でない内訳だけを出す（フォームの文字列のIDも受け付ける）", () => {
    expect(visibleBreakdownsFor("1", breakdowns).map((b) => b.name)).toEqual(["外食", "自炊"]);
    expect(visibleBreakdownsFor(OTHER, breakdowns)).toEqual([]);
  });

  it("U-92: 表示中の内訳があるカテゴリだけ内訳が必須（未選択のカテゴリ・非表示しかないカテゴリは不要）", () => {
    expect(isBreakdownRequired("1", breakdowns)).toBe(true);
    expect(isBreakdownRequired(String(OTHER), breakdowns)).toBe(false);
    expect(isBreakdownRequired("", breakdowns)).toBe(false);
    expect(isBreakdownRequired("99", breakdowns)).toBe(false);
  });

  it("U-92: 表示中の内訳が1つだけのカテゴリは自動で選び、それ以外は空", () => {
    expect(autoBreakdownIdFor("2", breakdowns)).toBe("20");
    expect(autoBreakdownIdFor("1", breakdowns)).toBe("");
    expect(autoBreakdownIdFor("3", breakdowns)).toBe("");
  });

  it("U-92: 内訳がそのカテゴリのものか（非表示の内訳も既存の値としては正しい）", () => {
    expect(isBreakdownOfCategory("12", "1", breakdowns)).toBe(true);
    expect(isBreakdownOfCategory("20", "1", breakdowns)).toBe(false);
    expect(isBreakdownOfCategory("999", "1", breakdowns)).toBe(false);
  });

  it("U-99: 一括入力で同じカテゴリだけを適用したら、内訳は未選択に戻る（F1-M-13 の不具合の再発防止）", () => {
    // 「食費 ＞ 自炊」の明細に、カテゴリ「食費」・内訳「各項目で選ぶ」を適用
    expect(breakdownIdAfterBulkApply("11", "1", undefined, breakdowns)).toBe("");
  });

  it("U-99: 一括入力で内訳も指定したらその内訳、内訳が1つのカテゴリは自動、カテゴリの指定なしは今のまま", () => {
    expect(breakdownIdAfterBulkApply("", "1", "11", breakdowns)).toBe("11");
    expect(breakdownIdAfterBulkApply("11", "2", undefined, breakdowns)).toBe("20");
    expect(breakdownIdAfterBulkApply("11", undefined, undefined, breakdowns)).toBe("11");
  });
});
