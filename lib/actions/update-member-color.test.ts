import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateMemberColor } from "@/lib/actions/update-member-color";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function fakeSupabase(updateResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(updateResult);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "admin-1" } } }),
    },
    from: vi.fn().mockReturnValue({ update }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("updateMemberColor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error for an invalid color", async () => {
    const result = await updateMemberColor("user-1", "rainbow");
    expect(result).toEqual({
      success: false,
      error: "不正な色が指定されました。",
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("returns an error when not logged in", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await updateMemberColor("user-1", "blue");
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("returns an error when RLS rejects the target (no rows updated)", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: null })
    );

    const result = await updateMemberColor("other-group-user", "blue");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("succeeds for a valid color", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { color: "blue" }, error: null })
    );

    const result = await updateMemberColor("user-1", "blue");
    expect(result).toEqual({ success: true, color: "blue" });
  });

  it("allows clearing the color (null)", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { color: null }, error: null })
    );

    const result = await updateMemberColor("user-1", null);
    expect(result).toEqual({ success: true, color: null });
  });
});
