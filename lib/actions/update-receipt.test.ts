import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateReceipt } from "@/lib/actions/update-receipt";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import type { ReceiptFormState, ReceiptItem } from "@/types/receipt";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/group", () => ({
  getCurrentMembership: vi.fn(),
  getGroupMembers: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  uploadReceiptImage: vi.fn(),
  deleteReceiptImage: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedGetCurrentMembership = vi.mocked(getCurrentMembership);
const mockedGetGroupMembers = vi.mocked(getGroupMembers);

const USER_A = "user-a";
const USER_B = "user-b";

function buildItem(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    clientId: "1",
    name: "テスト商品",
    price: "100",
    taxType: "inclusive",
    taxRateId: "",
    categoryId: "1",
    purposeId: "1",
    sceneIds: [],
    ownerUserId: OWNER_JOINT_VALUE,
    ...overrides,
  };
}

function buildState(overrides: Partial<ReceiptFormState> = {}): ReceiptFormState {
  return {
    payeeSelect: "1",
    payeeInputText: "",
    datetime: "2026-08-10T12:00",
    transactionTypeId: "1",
    amount: "100",
    payerUserId: USER_A,
    items: [buildItem()],
    ...overrides,
  };
}

function buildFormData(
  state: ReceiptFormState,
  image: File | null = null
): FormData {
  const formData = new FormData();
  formData.set("state", JSON.stringify(state));
  if (image) {
    formData.set("image", image);
  }
  return formData;
}

type FakeOptions = {
  existing?: {
    id: string;
    group_id: string;
    occurred_at: string;
    receipt_image_path: string | null;
  } | null;
  isSettlementConfirmed?: boolean;
};

function fakeSupabase({
  existing = {
    id: "receipt-1",
    group_id: "group-1",
    occurred_at: "2026-08-05T00:00:00Z",
    receipt_image_path: null,
  },
  isSettlementConfirmed = false,
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
              maybeSingle: vi.fn().mockResolvedValue({ data: existing }),
            }),
          }),
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === "payees") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { name: "セブンイレブン" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "receipt_details") {
        return {
          delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockReturnValue({
            select: vi
              .fn()
              .mockResolvedValue({ data: [{ id: "detail-1" }], error: null }),
          }),
        };
      }
      if (table === "receipt_detail_scenes") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: vi.fn().mockResolvedValue({ data: isSettlementConfirmed }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("updateReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetGroupMembers.mockResolvedValue([
      { userId: USER_A, role: "admin", displayName: "A", color: null },
      { userId: USER_B, role: "member", displayName: "B", color: null },
    ]);
  });

  it("requires login", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await updateReceipt("receipt-1", buildFormData(buildState()));
    expect(result).toEqual({ success: false, errors: ["ログインが必要です。"] });
  });

  it("returns an error when the receipt does not exist in the group", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase({ existing: null }));
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await updateReceipt("receipt-1", buildFormData(buildState()));
    expect(result).toEqual({
      success: false,
      errors: ["レシートが見つかりません。"],
    });
  });

  it("blocks the update when the current month's settlement is confirmed", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ isSettlementConfirmed: true })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await updateReceipt("receipt-1", buildFormData(buildState()));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]).toContain("確定済み");
    }
  });

  it("succeeds for a valid update", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await updateReceipt("receipt-1", buildFormData(buildState()));
    expect(result).toEqual({ success: true });
  });

  it("rejects a payerUserId that is not a group member", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await updateReceipt(
      "receipt-1",
      buildFormData(buildState({ payerUserId: "someone-else" }))
    );
    expect(result).toEqual({
      success: false,
      errors: ["支払者が不正です。"],
    });
  });

  it("allows changing the payer to another group member, regardless of who edits", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await updateReceipt(
      "receipt-1",
      buildFormData(buildState({ payerUserId: USER_B }))
    );
    expect(result).toEqual({ success: true });
  });
});
