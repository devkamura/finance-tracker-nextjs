import { beforeEach, describe, expect, it, vi } from "vitest";

import { deletePayee } from "@/lib/actions/delete-payee";
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

describe("deletePayee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when not logged in", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await deletePayee(1);
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("returns an error when the payee belongs to another group (no rows deleted)", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: null })
    );

    const result = await deletePayee(999);
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("succeeds for a payee in the caller's group", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { id: 1 }, error: null })
    );

    const result = await deletePayee(1);
    expect(result).toEqual({ success: true });
  });
});
