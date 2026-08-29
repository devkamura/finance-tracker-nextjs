import { beforeEach, describe, expect, it, vi } from "vitest";

import { removeGroupMember } from "@/lib/actions/remove-group-member";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function fakeSupabase(deleteResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(deleteResult);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ select });
  const del = vi.fn().mockReturnValue({ eq });
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "admin-1" } } }),
    },
    from: vi.fn().mockReturnValue({ delete: del }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("removeGroupMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when not logged in", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await removeGroupMember("member-1");
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("returns an error when RLS rejects the removal (no rows deleted)", async () => {
    // 他グループのメンバー、または対象が管理者自身(role='admin')の場合に相当。
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: null })
    );

    const result = await removeGroupMember("member-1");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("succeeds for a removable member", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { id: "member-1" }, error: null })
    );

    const result = await removeGroupMember("member-1");
    expect(result).toEqual({ success: true });
  });
});
