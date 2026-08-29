import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGroup } from "@/lib/actions/create-group";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

describe("createGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the name is blank", async () => {
    const result = await createGroup("   ");
    expect(result).toEqual({
      success: false,
      error: "グループ名を入力してください。",
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("returns an error when not logged in", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createGroup("我が家");
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("returns the created groupId on success", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { id: "group-1" }, error: null });
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
      rpc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createGroup("我が家");
    expect(result).toEqual({ success: true, groupId: "group-1" });
    expect(rpc).toHaveBeenCalledWith("create_group_with_admin", {
      p_name: "我が家",
    });
  });

  it("returns a friendly error when the user already belongs to a group", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "user already belongs to a group" },
    });
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
      rpc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await createGroup("我が家");
    expect(result).toEqual({
      success: false,
      error: "既にグループに所属しています。",
    });
  });
});
