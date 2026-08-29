import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateMemberDisplayName } from "@/lib/actions/update-member-display-name";
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

describe("updateMemberDisplayName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the display name is blank", async () => {
    const result = await updateMemberDisplayName("user-1", "   ");
    expect(result).toEqual({
      success: false,
      error: "表示名を入力してください。",
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("returns an error when not logged in", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await updateMemberDisplayName("user-1", "山田太郎");
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("returns an error when RLS rejects the target (no rows updated)", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: null })
    );

    const result = await updateMemberDisplayName("other-group-user", "山田太郎");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("succeeds for a valid target", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { display_name: "山田太郎" }, error: null })
    );

    const result = await updateMemberDisplayName("user-1", "山田太郎");
    expect(result).toEqual({ success: true, displayName: "山田太郎" });
  });
});
