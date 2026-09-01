import { beforeEach, describe, expect, it, vi } from "vitest";

import { reopenSettlement } from "@/lib/actions/reopen-settlement";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/group", () => ({ getCurrentMembership: vi.fn() }));

const mockedCreateClient = vi.mocked(createClient);
const mockedGetCurrentMembership = vi.mocked(getCurrentMembership);

const USER_A = "user-a";

function fakeSupabase(rpcError: unknown = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_A } } }),
    },
    rpc: vi.fn().mockResolvedValue({ error: rpcError }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("reopenSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires login", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await reopenSettlement(new Date("2026-08-15"));
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("rejects non-admin members", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await reopenSettlement(new Date("2026-08-15"));
    expect(result).toEqual({
      success: false,
      error: "管理者のみ再オープンできます。",
    });
  });

  it("reopens the settlement for an admin", async () => {
    const supabase = fakeSupabase();
    mockedCreateClient.mockResolvedValue(supabase);
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await reopenSettlement(new Date("2026-08-15"));
    expect(result).toEqual({ success: true });
    expect(supabase.rpc).toHaveBeenCalledWith("reopen_settlement", {
      p_group_id: "group-1",
      p_period_month: "2026-08-01",
    });
  });

  it("returns an error when the RPC fails (e.g. no confirmed settlement)", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ message: "boom" }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await reopenSettlement(new Date("2026-08-15"));
    expect(result).toEqual({
      success: false,
      error: "この月の精算は確定されていません。",
    });
  });
});
