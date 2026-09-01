import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmSettlement } from "@/lib/actions/confirm-settlement";
import { getSettlementSummary } from "@/lib/settlement/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import type { SettlementSummaryView } from "@/types/receipt";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/group", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/settlement/queries", () => ({ getSettlementSummary: vi.fn() }));

const mockedCreateClient = vi.mocked(createClient);
const mockedGetCurrentMembership = vi.mocked(getCurrentMembership);
const mockedGetSettlementSummary = vi.mocked(getSettlementSummary);

const USER_A = "user-a";

function buildSummary(
  overrides: Partial<SettlementSummaryView> = {}
): SettlementSummaryView {
  return {
    periodMonth: "2026-08-01",
    isConfirmed: false,
    userA: { userId: "user-a", displayName: "A", color: null, burden: 5000, paid: 10000, diff: 5000 },
    userB: { userId: "user-b", displayName: "B", color: null, burden: 5000, paid: 0, diff: -5000 },
    settlementFromUserId: "user-b",
    settlementToUserId: "user-a",
    settlementAmount: 5000,
    confirmedAt: null,
    reopenedAt: null,
    ...overrides,
  };
}

function fakeSupabase(rpcError: unknown = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_A } } }),
    },
    rpc: vi.fn().mockResolvedValue({ error: rpcError }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("confirmSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires login", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await confirmSettlement(new Date("2026-08-15"));
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("rejects non-admin members", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await confirmSettlement(new Date("2026-08-15"));
    expect(result).toEqual({
      success: false,
      error: "管理者のみ精算を確定できます。",
    });
    expect(mockedGetSettlementSummary).not.toHaveBeenCalled();
  });

  it("returns an error when the settlement is already confirmed", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });
    mockedGetSettlementSummary.mockResolvedValue(
      buildSummary({ isConfirmed: true })
    );

    const result = await confirmSettlement(new Date("2026-08-15"));
    expect(result).toEqual({
      success: false,
      error: "この月の精算は既に確定済みです。",
    });
  });

  it("confirms the settlement via RPC with the computed values", async () => {
    const supabase = fakeSupabase();
    mockedCreateClient.mockResolvedValue(supabase);
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });
    mockedGetSettlementSummary.mockResolvedValue(buildSummary());

    const result = await confirmSettlement(new Date("2026-08-15"));
    expect(result).toEqual({ success: true });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "confirm_settlement",
      expect.objectContaining({
        p_group_id: "group-1",
        p_period_month: "2026-08-01",
        p_settlement_amount: 5000,
        p_settlement_from_user_id: "user-b",
        p_settlement_to_user_id: "user-a",
      })
    );
  });

  it("returns an error when the RPC fails", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ message: "boom" }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });
    mockedGetSettlementSummary.mockResolvedValue(buildSummary());

    const result = await confirmSettlement(new Date("2026-08-15"));
    expect(result).toEqual({
      success: false,
      error: "精算の確定に失敗しました。",
    });
  });
});
