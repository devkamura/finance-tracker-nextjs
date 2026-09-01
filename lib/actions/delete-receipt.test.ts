import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteReceipt } from "@/lib/actions/delete-receipt";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import { deleteReceiptImage } from "@/lib/supabase/storage";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/group", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/storage", () => ({ deleteReceiptImage: vi.fn() }));

const mockedCreateClient = vi.mocked(createClient);
const mockedGetCurrentMembership = vi.mocked(getCurrentMembership);
const mockedDeleteReceiptImage = vi.mocked(deleteReceiptImage);

const USER_A = "user-a";

type FakeOptions = {
  receipt?: {
    id: string;
    group_id: string;
    occurred_at: string;
    receipt_image_path: string | null;
  } | null;
  isSettlementConfirmed?: boolean;
  deleteError?: unknown;
};

function fakeSupabase({
  receipt = {
    id: "receipt-1",
    group_id: "group-1",
    occurred_at: "2026-08-10T00:00:00Z",
    receipt_image_path: null,
  },
  isSettlementConfirmed = false,
  deleteError = null,
}: FakeOptions = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_A } } }),
    },
    from: vi.fn((table: string) => {
      if (table === "receipts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: receipt }),
            }),
          }),
          delete: () => ({
            eq: vi.fn().mockResolvedValue({ error: deleteError }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: vi.fn().mockResolvedValue({ data: isSettlementConfirmed }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("deleteReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires login", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await deleteReceipt("receipt-1");
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
  });

  it("returns an error when the receipt belongs to another group", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({
        receipt: {
          id: "receipt-1",
          group_id: "other-group",
          occurred_at: "2026-08-10T00:00:00Z",
          receipt_image_path: null,
        },
      })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await deleteReceipt("receipt-1");
    expect(result).toEqual({
      success: false,
      error: "レシートが見つかりません。",
    });
  });

  it("blocks deletion when the target month's settlement is confirmed", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ isSettlementConfirmed: true })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await deleteReceipt("receipt-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("確定済み");
    }
  });

  it("deletes the receipt and its image", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({
        receipt: {
          id: "receipt-1",
          group_id: "group-1",
          occurred_at: "2026-08-10T00:00:00Z",
          receipt_image_path: "group-1/receipt-1/img.png",
        },
      })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await deleteReceipt("receipt-1");
    expect(result).toEqual({ success: true });
    expect(mockedDeleteReceiptImage).toHaveBeenCalledWith(
      expect.anything(),
      "group-1/receipt-1/img.png"
    );
  });

  it("does not attempt to delete an image when there is none", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    await deleteReceipt("receipt-1");
    expect(mockedDeleteReceiptImage).not.toHaveBeenCalled();
  });
});
