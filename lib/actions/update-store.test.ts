import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateStore } from "@/lib/actions/update-store";
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

describe("updateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the name is blank", async () => {
    const result = await updateStore(1, "  ");
    expect(result).toEqual({ success: false, error: "店舗名を入力してください。" });
  });

  it("returns an error when the store belongs to another group (no rows updated)", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: null })
    );

    const result = await updateStore(999, "セブンイレブン");
    expect(result).toEqual({ success: false, error: "権限がありません。" });
  });

  it("returns a friendly error for a duplicate name", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: null, error: { code: "23505" } })
    );

    const result = await updateStore(1, "セブンイレブン");
    expect(result).toEqual({
      success: false,
      error: "同じ名前の店舗が既に存在します。",
    });
  });

  it("succeeds for a valid store", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ data: { id: 1, name: "セブンイレブン" }, error: null })
    );

    const result = await updateStore(1, "セブンイレブン");
    expect(result).toEqual({
      success: true,
      store: { id: 1, name: "セブンイレブン" },
    });
  });
});
