import { describe, expect, it } from "vitest";

import { CATEGORY_PALETTE, NO_VALUE_COLOR, paletteColor } from "@/lib/analytics/category-colors";
import {
  conditionsLabel,
  costTypeMap,
  dimensionKey,
  dimensionOptions,
  keyColor,
  keyLabel,
  matchesConditions,
} from "@/lib/analytics/dimensions";

const FOOD = 1;
const UTILITY = 4;

const master = {
  categories: [
    { id: FOOD, name: "食費", costType: "variable" as const },
    { id: UTILITY, name: "水道光熱費", costType: "fixed" as const },
  ],
  breakdowns: [
    { id: 11, categoryId: FOOD, name: "外食" },
    { id: 12, categoryId: FOOD, name: "自炊" },
    { id: 31, categoryId: UTILITY, name: "ガス" },
  ],
  counterparts: [
    { id: 21, name: "ふたり" },
    { id: 22, name: "友人" },
  ],
  payeeNames: ["", "myTOKYOGAS", "居酒屋"],
};
const costTypes = costTypeMap(master.categories);

const values = { categoryId: UTILITY, breakdownId: null, counterpartId: 21, payeeName: "myTOKYOGAS" };

describe("dimensions", () => {
  it("U-120: 明細の値（内訳なし・費用区分はカテゴリの設定）と、条件に当てはまるか", () => {
    expect(dimensionKey(values, "category", costTypes)).toBe("4");
    expect(dimensionKey(values, "breakdown", costTypes)).toBe("none");
    expect(dimensionKey(values, "costType", costTypes)).toBe("fixed");
    expect(dimensionKey(values, "payee", costTypes)).toBe("myTOKYOGAS");
    expect(dimensionKey(values, "counterpart", costTypes)).toBe("21");

    expect(matchesConditions(values, {}, costTypes)).toBe(true);
    expect(matchesConditions(values, { costType: "fixed", counterpart: "21" }, costTypes)).toBe(true);
    expect(matchesConditions(values, { costType: "fixed", counterpart: "22" }, costTypes)).toBe(false);
  });

  it("U-120: 値の表示名（内訳はカテゴリ付き、カテゴリで絞り込み中は内訳だけ）", () => {
    expect(keyLabel("breakdown", "11", master)).toBe("食費 ＞ 外食");
    expect(keyLabel("breakdown", "11", master, { withCategory: false })).toBe("外食");
    expect(keyLabel("breakdown", "none", master)).toBe("内訳なし");
    expect(keyLabel("costType", "variable", master)).toBe("変動費");
    expect(keyLabel("payee", "", master)).toBe("支払い先なし");
    expect(keyLabel("counterpart", "22", master)).toBe("友人");
    expect(keyLabel("counterpart", "999", master)).toBe("不明");
  });

  it("U-120: 色は、カテゴリは今までのカテゴリの色、内訳は同じカテゴリの中の順番、内訳なしはグレー", () => {
    expect(keyColor("category", "1", master)).toBe(CATEGORY_PALETTE[0]);
    expect(keyColor("category", "4", master)).toBe(CATEGORY_PALETTE[1]);
    expect(keyColor("breakdown", "11", master)).toBe(paletteColor(0));
    expect(keyColor("breakdown", "12", master)).toBe(paletteColor(1));
    // 別のカテゴリの内訳は、そのカテゴリの中の1番目
    expect(keyColor("breakdown", "31", master)).toBe(paletteColor(0));
    expect(keyColor("breakdown", "none", master)).toBe(NO_VALUE_COLOR);
    expect(keyColor("payee", "居酒屋", master)).toBe(paletteColor(2));
    // 隣り合う値が似た色にならないよう、パレットを飛ばして使う（12色で1巡する）
    const colors = Array.from({ length: 12 }, (_, i) => paletteColor(i));
    expect(new Set(colors).size).toBe(12);
    expect(paletteColor(1)).not.toBe(CATEGORY_PALETTE[1]);
  });

  it("U-120: 絞り込みの値の選択肢（内訳はカテゴリ順＋内訳なし）", () => {
    expect(dimensionOptions("breakdown", master).map((o) => o.label)).toEqual([
      "食費 ＞ 外食",
      "食費 ＞ 自炊",
      "水道光熱費 ＞ ガス",
      "内訳なし",
    ]);
    expect(dimensionOptions("costType", master)).toEqual([
      { key: "fixed", label: "固定費" },
      { key: "variable", label: "変動費" },
    ]);
    expect(dimensionOptions("payee", master).map((o) => o.label)).toEqual([
      "支払い先なし",
      "myTOKYOGAS",
      "居酒屋",
    ]);
  });

  it("U-120: 条件の表示名（内訳があればカテゴリを重ねない、相手は「相手：」を付ける）", () => {
    expect(conditionsLabel({}, master)).toBeNull();
    expect(conditionsLabel({ category: "1" }, master)).toBe("食費");
    expect(conditionsLabel({ category: "1", breakdown: "11" }, master)).toBe("食費 ＞ 外食");
    expect(conditionsLabel({ breakdown: "none" }, master)).toBe("内訳なし");
    expect(conditionsLabel({ costType: "fixed", category: "4" }, master)).toBe("固定費・水道光熱費");
    expect(conditionsLabel({ payee: "居酒屋", counterpart: "22" }, master)).toBe(
      "居酒屋・相手：友人"
    );
  });
});
