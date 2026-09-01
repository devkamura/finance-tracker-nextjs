import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPayee } from "@/lib/actions/create-payee";
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

describe("createPayee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the name is blank", async () => {
    const result = await createPayee("   ");
    expect(result).toEqual({ success: false, error: "支払い先名を入力してください。" });
  });

  it("returns an error when the caller is not an admin", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ data: null, error: null }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await createPayee("セブンイレブン");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("returns a friendly error for a duplicate payee name", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: { code: "23505" } })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await createPayee("セブンイレブン");
    expect(result).toEqual({
      success: false,
      error: "同じ名前の支払い先が既に存在します。",
    });
  });

  it("succeeds for a new payee name", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { id: 1, name: "セブンイレブン" }, error: null })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });

    const result = await createPayee("セブンイレブン");
    expect(result).toEqual({
      success: true,
      payee: { id: 1, name: "セブンイレブン" },
    });
  });
});
