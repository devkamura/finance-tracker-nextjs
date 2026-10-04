import { describe, expect, it, vi } from "vitest";

import {
  getCategoriesWithCostType,
  getCategoryBreakdowns,
  getCounterpartNames,
  getCounterparts,
  getPayees,
  getTags,
  getUsedSettingIds,
} from "@/lib/settings/queries";

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

  it("U-106: 相手のメンバーは表示名を使い、グループから外れたメンバーの相手は含めない", async () => {
    const supabase = fakeSupabase({
      counterparts: [
        { id: 1, kind: "member", user_id: "user-a", name: null, is_hidden: false },
        { id: 2, kind: "member", user_id: "gone", name: null, is_hidden: false },
        { id: 3, kind: "default", user_id: null, name: "ふたり", is_hidden: false },
        { id: 4, kind: "custom", user_id: null, name: "同僚", is_hidden: true },
      ],
    });
    expect(
      await getCounterparts(supabase, "group-1", [{ userId: "user-a", displayName: "あきら" }])
    ).toEqual([
      { id: 1, kind: "member", userId: "user-a", name: "あきら", isHidden: false },
      { id: 3, kind: "default", userId: null, name: "ふたり", isHidden: false },
      { id: 4, kind: "custom", userId: null, name: "同僚", isHidden: true },
    ]);
  });

  it("U-121: 分析・一覧の相手の名前は、非表示とグループから外れたメンバー（unknown）も含める", async () => {
    const supabase = fakeSupabase({
      counterparts: [
        { id: 1, kind: "member", user_id: "user-a", name: null },
        { id: 2, kind: "member", user_id: "gone", name: null },
        { id: 3, kind: "default", user_id: null, name: "ふたり" },
        { id: 4, kind: "custom", user_id: null, name: "同僚" },
      ],
    });
    expect(
      await getCounterpartNames(supabase, "group-1", [{ userId: "user-a", displayName: "あきら" }])
    ).toEqual([
      { id: 1, name: "あきら" },
      { id: 2, name: "unknown" },
      { id: 3, name: "ふたり" },
      { id: 4, name: "同僚" },
    ]);
  });

  it("U-106: タグを画面用の形（非表示を含む）に変換する", async () => {
    const supabase = fakeSupabase({
      tags: [
        { id: 5, name: "朝食", is_hidden: false },
        { id: 6, name: "旧", is_hidden: true },
      ],
    });
    expect(await getTags(supabase, "group-1")).toEqual([
      { id: 5, name: "朝食", isHidden: false },
      { id: 6, name: "旧", isHidden: true },
    ]);
  });

  it("U-110: 支払い先を画面用の形（グループ全体・自分用・非表示・既定値・既定値のタグ・別名）に変換する", async () => {
    const supabase = fakeSupabase({
      payees: [
        {
          id: 1,
          name: "myTOKYOGAS",
          owner_user_id: null,
          is_hidden: false,
          default_category_id: 4,
          default_breakdown_id: null,
          default_counterpart_id: 3,
          default_owner_joint: true,
          default_owner_user_id: null,
          payee_default_tags: [{ tag_id: 7 }],
          payee_aliases: [
            { id: 12, name: "東京ガス" },
            { id: 11, name: "TOKYO GAS" },
          ],
        },
        {
          id: 2,
          name: "〇〇薬局",
          owner_user_id: "user-b",
          is_hidden: true,
          default_category_id: null,
          default_breakdown_id: null,
          default_counterpart_id: null,
          default_owner_joint: false,
          default_owner_user_id: "user-b",
          payee_default_tags: [],
          payee_aliases: [],
        },
      ],
    });

    expect(await getPayees(supabase, "group-1")).toEqual([
      {
        id: 1,
        name: "myTOKYOGAS",
        ownerUserId: null,
        isHidden: false,
        defaults: {
          categoryId: "4",
          breakdownId: "",
          counterpartId: "3",
          ownerUserId: "joint",
          tagIds: ["7"],
        },
        // 別名は名前順
        aliases: [
          { id: 11, name: "TOKYO GAS" },
          { id: 12, name: "東京ガス" },
        ],
      },
      {
        id: 2,
        name: "〇〇薬局",
        ownerUserId: "user-b",
        isHidden: true,
        defaults: {
          categoryId: "",
          breakdownId: "",
          counterpartId: "",
          ownerUserId: "user-b",
          tagIds: [],
        },
        aliases: [],
      },
    ]);
  });

  it("U-131: 使われている支払い先・内訳・相手・タグのIDを DB の used_setting_ids から取得する", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { payees: [1, 2], breakdowns: [11], counterparts: [3], tags: [] },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { rpc } as any;

    expect(await getUsedSettingIds(supabase, "group-1")).toEqual({
      payees: [1, 2],
      breakdowns: [11],
      counterparts: [3],
      tags: [],
    });
    expect(rpc).toHaveBeenCalledWith("used_setting_ids", { p_group_id: "group-1" });

    // 項目が欠けていても空の一覧として扱う。エラーはそのまま投げる
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empty = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) } as any;
    expect(await getUsedSettingIds(empty, "group-1")).toEqual({
      payees: [],
      breakdowns: [],
      counterparts: [],
      tags: [],
    });
    const failed = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("rpc failed") }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    await expect(getUsedSettingIds(failed, "group-1")).rejects.toThrow("rpc failed");
  });
});
