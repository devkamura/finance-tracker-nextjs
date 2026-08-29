import { beforeEach, describe, expect, it, vi } from "vitest";

import { inviteGroupMember } from "@/lib/actions/invite-group-member";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/group", () => ({
  getCurrentMembership: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedGetCurrentMembership = vi.mocked(getCurrentMembership);

function fakeSupabase(insertResult: { error: unknown }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }),
    },
    from: vi.fn().mockReturnValue({ insert }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("inviteGroupMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when not logged in", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await inviteGroupMember("user@example.com");
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("returns a validation error for a malformed email", async () => {
    const result = await inviteGroupMember("not-an-email");
    expect(result).toEqual({
      success: false,
      error: "メールアドレスの形式が正しくありません。",
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("returns an error when the caller is not an admin", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ error: null }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await inviteGroupMember("user@example.com");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("returns a friendly error for a duplicate invite", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ error: { code: "23505" } })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await inviteGroupMember("user@example.com");
    expect(result).toEqual({
      success: false,
      error: "既に追加済みのメールアドレスです。",
    });
  });

  it("succeeds for a valid invite", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ error: null }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await inviteGroupMember("  User@Example.com  ");
    expect(result).toEqual({ success: true });
  });
});
