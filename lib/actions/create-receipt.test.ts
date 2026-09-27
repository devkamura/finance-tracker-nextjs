import { beforeEach, describe, expect, it, vi } from "vitest";

import { createReceipt } from "@/lib/actions/create-receipt";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";
import { deleteReceiptImage, uploadReceiptImage } from "@/lib/supabase/storage";
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
const mockedDeleteReceiptImage = vi.mocked(deleteReceiptImage);

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
    payerUserId: "",
    items: [buildItem()],
    ...overrides,
  };
}

function buildFormData(
  state: ReceiptFormState,
  image: File | null = null,
  duplicateForPartner = false
): FormData {
  const formData = new FormData();
  formData.set("state", JSON.stringify(state));
  if (image) {
    formData.set("image", image);
  }
  if (duplicateForPartner) {
    formData.set("duplicateForPartner", "true");
  }
  return formData;
}

type FakeSupabaseOptions = {
  isSettlementConfirmed?: boolean;
  payeeName?: string;
  receiptInsertError?: unknown;
  detailsInsertError?: unknown;
  // n回目（0始まり）のreceipts INSERTだけを失敗させたい場合に指定する
  receiptInsertErrorAt?: number;
};

function fakeSupabase(options: FakeSupabaseOptions = {}) {
  const {
    isSettlementConfirmed = false,
    payeeName = "セブンイレブン",
    receiptInsertError = null,
    detailsInsertError = null,
    receiptInsertErrorAt,
  } = options;

  const insertedDetailIds = [{ id: "detail-1" }];
  // 呼び出し内容を検証できるよう、INSERT/DELETEされた行を記録する
  const receiptInserts: Record<string, unknown>[] = [];
  const receiptDeletes: string[] = [];
  const detailInserts: Record<string, unknown>[][] = [];

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
        insert: vi.fn((row: Record<string, unknown>) => {
          const index = receiptInserts.length;
          receiptInserts.push(row);
          const error =
            receiptInsertErrorAt === index
              ? { message: "boom" }
              : receiptInsertError;
          return Promise.resolve({ error });
        }),
        delete: () => ({
          eq: vi.fn((_column: string, id: string) => {
            receiptDeletes.push(id);
            return Promise.resolve({ error: null });
          }),
        }),
      };
    }
    if (table === "receipt_details") {
      return {
        insert: vi.fn((rows: Record<string, unknown>[]) => {
          detailInserts.push(rows);
          return {
            select: vi.fn().mockResolvedValue({
            data: detailsInsertError ? null : insertedDetailIds,
            error: detailsInsertError,
          }),
          };
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
    receiptInserts,
    receiptDeletes,
    detailInserts,
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

  // --- 相方分レシートの同時登録（複製登録） ---

  it("U-54: チェックOFFでは従来どおり自分のレシート1件のみ登録する", async () => {
    const supabase = fakeSupabase();
    mockedCreateClient.mockResolvedValue(supabase);
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const result = await createReceipt(buildFormData(buildState()));

    expect(result.success).toBe(true);
    expect(supabase.receiptInserts).toHaveLength(1);
    expect(supabase.receiptInserts[0]).toMatchObject({
      payer_user_id: USER_A,
      created_by: USER_A,
      is_duplicated: false,
    });
  });

  it("U-55: チェックONでは支払者＝相方の複製レシートも登録し、帰属先の私を相方に置き換える", async () => {
    const supabase = fakeSupabase();
    mockedCreateClient.mockResolvedValue(supabase);
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });

    const state = buildState({
      amount: "600",
      items: [
        buildItem({ clientId: "1", price: "100", ownerUserId: USER_A }),
        buildItem({ clientId: "2", price: "200", ownerUserId: USER_B }),
        buildItem({ clientId: "3", price: "300", ownerUserId: OWNER_JOINT_VALUE }),
      ],
    });
    const result = await createReceipt(buildFormData(state, null, true));

    expect(result.success).toBe(true);
    expect(supabase.receiptInserts).toHaveLength(2);
    const [own, partner] = supabase.receiptInserts;
    expect(own).toMatchObject({
      payer_user_id: USER_A,
      created_by: USER_A,
      is_duplicated: false,
      amount: 600,
    });
    expect(partner).toMatchObject({
      payer_user_id: USER_B,
      created_by: USER_A,
      is_duplicated: true,
      amount: 600,
      payee_name: own.payee_name,
      occurred_at: own.occurred_at,
      transaction_type_id: own.transaction_type_id,
    });
    expect(partner.id).not.toBe(own.id);
    // 戻り値は自分のレシート（一覧遷移時に展開する対象）
    if (result.success) {
      expect(result.receiptId).toBe(own.id);
    }

    // 明細の帰属先：私→相方、相方→相方、共同→共同（NULL）
    const [ownDetails, partnerDetails] = supabase.detailInserts;
    expect(ownDetails.map((d: Record<string, unknown>) => d.owner_user_id)).toEqual([
      USER_A,
      USER_B,
      null,
    ]);
    expect(
      partnerDetails.map((d: Record<string, unknown>) => d.owner_user_id)
    ).toEqual([USER_B, USER_B, null]);
    expect(partnerDetails.map((d: Record<string, unknown>) => d.price)).toEqual([
      100, 200, 300,
    ]);
  });

  it("U-56: 画像付きで複製登録すると、画像を別ファイルとして2回アップロードする", async () => {
    const supabase = fakeSupabase();
    mockedCreateClient.mockResolvedValue(supabase);
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });
    mockedUploadReceiptImage.mockImplementation(
      async (_client, groupId, receiptId) => `${groupId}/${receiptId}/img.png`
    );

    const file = new File(["dummy"], "receipt.png", { type: "image/png" });
    const result = await createReceipt(buildFormData(buildState(), file, true));

    expect(result.success).toBe(true);
    expect(mockedUploadReceiptImage).toHaveBeenCalledTimes(2);
    const [own, partner] = supabase.receiptInserts;
    expect(mockedUploadReceiptImage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "group-1",
      own.id,
      file
    );
    expect(mockedUploadReceiptImage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "group-1",
      partner.id,
      file
    );
    expect(partner.receipt_image_path).not.toBe(own.receipt_image_path);
  });

  it("U-57: 複製側の登録に失敗した場合は自分のレシートと画像も取り消す", async () => {
    const supabase = fakeSupabase({ receiptInsertErrorAt: 1 });
    mockedCreateClient.mockResolvedValue(supabase);
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "member",
    });
    mockedUploadReceiptImage.mockImplementation(
      async (_client, groupId, receiptId) => `${groupId}/${receiptId}/img.png`
    );

    const file = new File(["dummy"], "receipt.png", { type: "image/png" });
    const result = await createReceipt(buildFormData(buildState(), file, true));

    expect(result).toEqual({
      success: false,
      errors: ["相方分のレシートの登録に失敗しました。"],
    });
    const [own, partner] = supabase.receiptInserts;
    expect(supabase.receiptDeletes).toContain(own.id);
    expect(mockedDeleteReceiptImage).toHaveBeenCalledWith(
      expect.anything(),
      own.receipt_image_path
    );
    expect(mockedDeleteReceiptImage).toHaveBeenCalledWith(
      expect.anything(),
      partner.receipt_image_path
    );
  });

  it("U-58: 相方がいないグループで複製指定された場合は何も登録しない", async () => {
    const supabase = fakeSupabase();
    mockedCreateClient.mockResolvedValue(supabase);
    mockedGetCurrentMembership.mockResolvedValue({
      groupId: "group-1",
      role: "admin",
    });
    mockedGetGroupMembers.mockResolvedValue([
      { userId: USER_A, role: "admin", displayName: "A", color: null },
    ]);

    const result = await createReceipt(buildFormData(buildState(), null, true));

    expect(result).toEqual({
      success: false,
      errors: ["相方がグループにいないため、複製登録できません。"],
    });
    expect(supabase.receiptInserts).toHaveLength(0);
  });
});
