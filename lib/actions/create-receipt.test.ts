import { beforeEach, describe, expect, it, vi } from "vitest";

import { createReceipt } from "@/lib/actions/create-receipt";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import { uploadReceiptImage } from "@/lib/supabase/storage";
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
const mockedUploadReceiptImage = vi.mocked(uploadReceiptImage);

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

type FakeSupabaseOptions = {
  isSettlementConfirmed?: boolean;
  payeeName?: string;
  receiptInsertError?: unknown;
  detailsInsertError?: unknown;
};

function fakeSupabase(options: FakeSupabaseOptions = {}) {
  const {
    isSettlementConfirmed = false,
    payeeName = "セブンイレブン",
    receiptInsertError = null,
    detailsInsertError = null,
  } = options;

  const insertedDetailIds = [{ id: "detail-1" }];

  const from = vi.fn((table: string) => {
    if (table === "payees") {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { name: payeeName },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "receipts") {
      return {
        insert: vi.fn().mockResolvedValue({ error: receiptInsertError }),
        delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    if (table === "receipt_details") {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: detailsInsertError ? null : insertedDetailIds,
            error: detailsInsertError,
          }),
        }),
      };
    }
    if (table === "receipt_detail_scenes") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_A } } }),
    },
    from,
    rpc: vi.fn().mockResolvedValue({ data: isSettlementConfirmed }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("createReceipt", () => {
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

    const result = await createReceipt(buildFormData(buildState()));
    expect(result).toEqual({ success: false, errors: ["ログインが必要です。"] });
  });

  it("requires group membership", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue(null);

    const result = await createReceipt(buildFormData(buildState()));
    expect(result).toEqual({
      success: false,
      errors: ["グループに所属していません。"],
    });
  });

  it("returns validation errors for an invalid form", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await createReceipt(
      buildFormData(buildState({ items: [buildItem({ price: "" })] }))
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContain("項目1: 価格は必須です。");
    }
  });

  it("blocks registration when the target month's settlement is confirmed", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ isSettlementConfirmed: true })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await createReceipt(buildFormData(buildState()));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]).toContain("確定済み");
    }
  });

  it("succeeds for a valid form without an image", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await createReceipt(buildFormData(buildState()));
    expect(result.success).toBe(true);
    expect(mockedUploadReceiptImage).not.toHaveBeenCalled();
  });

  it("uploads the image before inserting the receipt when a file is given", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase());
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });
    mockedUploadReceiptImage.mockResolvedValue("group-1/receipt-1/img.png");

    const file = new File(["dummy"], "receipt.png", { type: "image/png" });
    const result = await createReceipt(buildFormData(buildState(), file));

    expect(result.success).toBe(true);
    expect(mockedUploadReceiptImage).toHaveBeenCalledWith(
      expect.anything(),
      "group-1",
      expect.any(String),
      file
    );
  });

  it("rolls back the receipt row when inserting details fails", async () => {
    mockedCreateClient.mockResolvedValue(
      fakeSupabase({ detailsInsertError: { message: "boom" } })
    );
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await createReceipt(buildFormData(buildState()));
    expect(result).toEqual({
      success: false,
      errors: ["レシート明細の登録に失敗しました。"],
    });
  });
});
