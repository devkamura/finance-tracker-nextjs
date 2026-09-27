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
});
