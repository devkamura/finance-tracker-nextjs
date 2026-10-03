import { describe, expect, it } from "vitest";

import { getCategoriesWithCostType, getCategoryBreakdowns } from "@/lib/settings/queries";

// テーブルごとに返すデータを決めた、Supabaseクエリビルダーの最小限の再現
function fakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const result = Promise.resolve({ data: tables[table] ?? [], error: null });
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Object.assign(result, chain),
        then: result.then.bind(result),
      };
      return chain;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("settings/queries", () => {
  it("U-97: グループで設定した費用区分を優先し、設定がなければカテゴリの初期値を使う", async () => {
    const supabase = fakeSupabase({
      categories: [
        { id: 1, name: "食費", default_cost_type: "variable" },
        { id: 2, name: "通信費", default_cost_type: "fixed" },
        { id: 3, name: "娯楽", default_cost_type: "variable" },
      ],
      category_settings: [{ category_id: 3, cost_type: "fixed" }],
    });

    expect(await getCategoriesWithCostType(supabase, "group-1")).toEqual([
      { id: 1, name: "食費", costType: "variable" },
      { id: 2, name: "通信費", costType: "fixed" },
      { id: 3, name: "娯楽", costType: "fixed" },
    ]);
  });

  it("U-97: 内訳を画面用の形（非表示を含む）に変換する", async () => {
    const supabase = fakeSupabase({
      category_breakdowns: [
        { id: 10, category_id: 1, name: "外食", is_hidden: false },
        { id: 11, category_id: 1, name: "旧", is_hidden: true },
      ],
    });
    expect(await getCategoryBreakdowns(supabase, "group-1")).toEqual([
      { id: 10, categoryId: 1, name: "外食", isHidden: false },
      { id: 11, categoryId: 1, name: "旧", isHidden: true },
    ]);
  });
});
