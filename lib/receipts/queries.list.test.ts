import { beforeEach, describe, expect, it, vi } from "vitest";

import { listReceipts } from "@/lib/receipts/queries";
import { getGroupMembers } from "@/lib/supabase/group";

vi.mock("@/lib/supabase/group", () => ({ getGroupMembers: vi.fn() }));
vi.mock("@/lib/supabase/storage", () => ({
  getReceiptImageSignedUrl: vi.fn(),
}));

const mockedGetGroupMembers = vi.mocked(getGroupMembers);

const USER_A = "user-a";
const USER_B = "user-b";

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "receipt-1",
    occurred_at: "2026-09-10T03:00:00.000Z",
    payee_name: "スーパー",
    amount: 1000,
    payer_user_id: USER_B,
    receipt_image_path: null,
    is_duplicated: false,
    created_by: USER_B,
    transaction_types: { name: "支出" },
    receipt_details: [],
    ...overrides,
  };
}

// listReceiptsが使うクエリビルダーのチェーン（select→eq→gte→lt→order）だけを再現する
function fakeSupabase(rows: unknown[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lt: () => chain,
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => chain } as any;
}

describe("listReceipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetGroupMembers.mockResolvedValue([
      { userId: USER_A, role: "admin", displayName: "あきら", color: null },
      { userId: USER_B, role: "member", displayName: "みき", color: null },
    ]);
  });

  it("U-59: 複製フラグと登録者の表示名をマッピングする", async () => {
    const supabase = fakeSupabase([
      buildRow({ id: "dup", is_duplicated: true, created_by: USER_A }),
      buildRow({ id: "normal" }),
    ]);

    const result = await listReceipts(supabase, "group-1", {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 1),
    });

    expect(result.map((r) => [r.id, r.isDuplicated, r.createdByDisplayName])).toEqual([
      ["dup", true, "あきら"],
      ["normal", false, "みき"],
    ]);
    // 複製レシートの支払者は相方のまま
    expect(result[0].payerDisplayName).toBe("みき");
  });

  it("U-87: 明細にカテゴリIDと税率の倍率が入る（税込はnull）", async () => {
    const supabase = fakeSupabase([
      buildRow({
        receipt_details: [
          {
            id: "d1",
            item_name: "お米",
            price: 1000,
            tax_type: "exclusive",
            owner_user_id: null,
            category_id: 3,
            consumption_taxes: { name: "8%", multiplier: 1.08 },
            categories: { name: "食費" },
            counterparts: { kind: "default", user_id: null, name: "ふたり" },
            receipt_detail_tags: [],
          },
          {
            id: "d2",
            item_name: "洗剤",
            price: 500,
            tax_type: "inclusive",
            owner_user_id: USER_A,
            category_id: 4,
            consumption_taxes: null,
            categories: { name: "日用品" },
            counterparts: { kind: "default", user_id: null, name: "ふたり" },
            receipt_detail_tags: [],
          },
        ],
      }),
    ]);

    const [receipt] = await listReceipts(supabase, "group-1", {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 1),
    });

    expect(receipt.items.map((i) => [i.categoryId, i.taxRateMultiplier])).toEqual([
      [3, 1.08],
      [4, null],
    ]);
  });

  it("U-98: 明細に内訳のIDと名前が入る（内訳なしはnull）", async () => {
    const detail = {
      item_name: "x",
      price: 100,
      tax_type: "inclusive",
      owner_user_id: null,
      category_id: 1,
      consumption_taxes: null,
      categories: { name: "食費" },
      counterparts: { kind: "default", user_id: null, name: "ふたり" },
      receipt_detail_tags: [],
    };
    const supabase = fakeSupabase([
      buildRow({
        receipt_details: [
          { ...detail, id: "d1", breakdown_id: 10, category_breakdowns: { name: "外食" } },
          { ...detail, id: "d2", breakdown_id: null, category_breakdowns: null },
        ],
      }),
    ]);

    const [receipt] = await listReceipts(supabase, "group-1", {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 1),
    });

    expect(receipt.items.map((i) => [i.breakdownId, i.breakdownName])).toEqual([
      [10, "外食"],
      [null, null],
    ]);
  });

  it("U-100: 相手の表示名（メンバーは表示名、外れたメンバーはunknown）とタグ名（並び順）が入る", async () => {
    const detail = {
      item_name: "x",
      price: 100,
      tax_type: "inclusive",
      owner_user_id: null,
      category_id: 1,
      breakdown_id: null,
      category_breakdowns: null,
      consumption_taxes: null,
      categories: { name: "食費" },
      receipt_detail_tags: [],
    };
    const supabase = fakeSupabase([
      buildRow({
        receipt_details: [
          {
            ...detail,
            id: "d1",
            counterpart_id: 22,
            counterparts: { kind: "default", user_id: null, name: "友人" },
            receipt_detail_tags: [
              { tags: { name: "夕食", sort_order: 3 } },
              { tags: { name: "朝食", sort_order: 1 } },
            ],
          },
          {
            ...detail,
            id: "d2",
            counterpart_id: 23,
            counterparts: { kind: "member", user_id: USER_A, name: null },
          },
          {
            ...detail,
            id: "d3",
            counterpart_id: 24,
            counterparts: { kind: "member", user_id: "gone", name: null },
          },
        ],
      }),
    ]);

    const [receipt] = await listReceipts(supabase, "group-1", {
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 1),
    });

    expect(receipt.items.map((i) => [i.counterpartName, i.tagNames])).toEqual([
      ["友人", ["朝食", "夕食"]],
      ["あきら", []],
      ["unknown", []],
    ]);
    // 一覧の相手での絞り込み（分析拡充 F4）に使う相手のID
    expect(receipt.items.map((i) => i.counterpartId)).toEqual([22, 23, 24]);
  });
});
