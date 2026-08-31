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

function fakeSupabase(options: {
  memberCount?: number;
  insertError?: unknown;
}) {
  const { memberCount = 1, insertError = null } = options;
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ count: memberCount }),
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }),
    },
    from: vi.fn().mockReturnValue({ select, insert }),
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
    mockedCreateClient.mockResolvedValue(fakeSupabase({}));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await inviteGroupMember("user@example.com");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("returns an error when the group already has 2 members", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ memberCount: 2 }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await inviteGroupMember("user@example.com");
    expect(result).toEqual({
      success: false,
      error: "グループの登録人数上限（管理者含め2人）に達しています。",
    });
  });

  it("returns a friendly error for a duplicate invite", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ insertError: { code: "23505" } })
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

  it("returns a friendly error when the DB trigger rejects a concurrent 3rd member", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({
        insertError: { message: "group member limit (2) reached" },
      })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await inviteGroupMember("user@example.com");
    expect(result).toEqual({
      success: false,
      error: "グループの登録人数上限（管理者含め2人）に達しています。",
    });
  });

  it("succeeds for a valid invite", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ memberCount: 1 }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await inviteGroupMember("  User@Example.com  ");
    expect(result).toEqual({ success: true });
  });
});
