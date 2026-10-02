import { describe, expect, it } from "vitest";

import { CATEGORY_PALETTE, categoryColor } from "@/lib/analytics/category-colors";

const categories = Array.from({ length: 13 }, (_, i) => ({ id: i + 10, name: `c${i}` }));

describe("categoryColor", () => {
  it("U-74: カテゴリID順にパレットが割り当てられ、13番目は1番目と同じ色になる", () => {
    expect(categoryColor(10, categories)).toBe(CATEGORY_PALETTE[0]);
    expect(categoryColor(21, categories)).toBe(CATEGORY_PALETTE[11]);
    expect(categoryColor(22, categories)).toBe(CATEGORY_PALETTE[0]);
  });

  it("U-74: カテゴリに色が設定されていればその色を使う", () => {
    const withColor = [{ id: 1, color: "#123456" }, { id: 2 }];
    expect(categoryColor(1, withColor)).toBe("#123456");
    expect(categoryColor(2, withColor)).toBe(CATEGORY_PALETTE[1]);
  });

  it("U-74: メンバーの色（ブルー／レッド）系の色はパレットに含まれない", () => {
    const blueAndRed = ["#3b82f6", "#ef4444", "#2563eb", "#dc2626"];
    for (const color of blueAndRed) {
      expect(CATEGORY_PALETTE).not.toContain(color);
    }
    expect(CATEGORY_PALETTE).toHaveLength(12);
  });
});
