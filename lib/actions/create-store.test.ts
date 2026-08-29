import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStore } from "@/lib/actions/create-store";
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

function fakeSupabase(insertResult: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(insertResult);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "admin-1" } } }),
    },
    from: vi.fn().mockReturnValue({ insert }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("createStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the name is blank", async () => {
    const result = await createStore("   ");
    expect(result).toEqual({ success: false, error: "店舗名を入力してください。" });
  });

  it("returns an error when the caller is not an admin", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ data: null, error: null }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await createStore("セブンイレブン");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("returns a friendly error for a duplicate store name", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: { code: "23505" } })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await createStore("セブンイレブン");
    expect(result).toEqual({
      success: false,
      error: "同じ名前の店舗が既に存在します。",
    });
  });

  it("succeeds for a new store name", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { id: 1, name: "セブンイレブン" }, error: null })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await createStore("セブンイレブン");
    expect(result).toEqual({
      success: true,
      store: { id: 1, name: "セブンイレブン" },
    });
  });
});
