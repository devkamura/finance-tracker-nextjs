import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// レシート/明細/精算のRLS・RPCの実際の振る舞いを、service_roleで用意した
// 2人グループを使って検証する（docs/basic-design.md 3〜5章）。
describe("レシート・精算のRLS/RPC", () => {
  const admin = createServiceRoleClient();

  let userA: TestUser; // グループ管理者
  let userB: TestUser; // 一般メンバー
  let outsider: TestUser; // 別グループのユーザー
  let groupId: string;
  let categoryId: number;
  let purposeId: number;
  let taxRate8: number;
  let transactionTypeExpenseId: number;
  let transactionTypeRefundId: number;

  beforeAll(async () => {
    userA = await createSignedInTestUser(admin, "settlement-a");
    userB = await createSignedInTestUser(admin, "settlement-b");
    outsider = await createSignedInTestUser(admin, "settlement-outsider");

    const { data: group, error: groupError } = await userA.client.rpc(
      "create_group_with_admin",
      { p_name: "精算テストグループ" }
    );
    if (groupError) throw groupError;
    groupId = group.id;

    const { error: inviteError } = await userA.client
      .from("group_members")
      .insert({
        group_id: groupId,
        invited_email: userB.email.toLowerCase(),
        role: "member",
      });
    if (inviteError) throw inviteError;

    const { error: linkError } = await userB.client.rpc(
      "link_pending_group_memberships"
    );
    if (linkError) throw linkError;

    await outsider.client.rpc("create_group_with_admin", {
      p_name: "他グループ",
    });

    const [{ data: categories }, { data: purposes }, { data: taxes }, { data: types }] =
      await Promise.all([
        admin.from("categories").select("id").eq("name", "食費").single(),
        admin.from("purposes").select("id").eq("name", "生活維持").single(),
        admin.from("consumption_taxes").select("id").eq("name", "8%").single(),
        admin.from("transaction_types").select("id, name"),
      ]);
    categoryId = categories!.id;
    purposeId = purposes!.id;
    taxRate8 = taxes!.id;
    transactionTypeExpenseId = types!.find((t) => t.name === "支出")!.id;
    transactionTypeRefundId = types!.find((t) => t.name === "返金")!.id;
  });

  afterAll(async () => {
    await deleteTestUser(admin, userA.id);
    await deleteTestUser(admin, userB.id);
    await deleteTestUser(admin, outsider.id);
  });

  it("マスタデータが要件定義書どおりに整理されている", async () => {
    const { data: categories } = await admin.from("categories").select("name");
    const names = (categories ?? []).map((c) => c.name);
    expect(names).toContain("交際費");
    expect(names).toContain("衣類・ファッション");

    const { data: purposes } = await admin.from("purposes").select("name");
    const purposeNames = (purposes ?? []).map((p) => p.name);
    expect(purposeNames).toContain("友人");
    expect(purposeNames).not.toContain("交際費");

    const { data: taxes } = await admin.from("consumption_taxes").select("name");
    const taxNames = (taxes ?? []).map((t) => t.name);
    expect(taxNames.sort()).toEqual(["10%", "8%"]);
  });

  it("一般メンバーもグループ内メンバーの表示名を読める", async () => {
    const { data, error } = await userB.client
      .from("profiles")
      .select("display_name")
      .eq("id", userA.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("メンバーはレシートと明細を登録できる", async () => {
    const receiptId = crypto.randomUUID();
    const { error: receiptError } = await userA.client.from("receipts").insert({
      id: receiptId,
      group_id: groupId,
      payee_name: "テストスーパー",
      transaction_type_id: transactionTypeExpenseId,
      occurred_at: "2026-08-10T03:00:00Z",
      payer_user_id: userA.id,
      created_by: userA.id,
      amount: 1500,
    });
    expect(receiptError).toBeNull();

    const { data: details, error: detailsError } = await userA.client
      .from("receipt_details")
      .insert([
        {
          receipt_id: receiptId,
          item_name: "食品",
          price: 1000,
          tax_type: "inclusive",
          category_id: categoryId,
          purpose_id: purposeId,
          owner_user_id: null,
        },
        {
          receipt_id: receiptId,
          item_name: "Bの化粧品",
          price: 1000,
          tax_type: "inclusive",
          category_id: categoryId,
          purpose_id: purposeId,
          owner_user_id: userB.id,
        },
      ])
      .select("id");
    expect(detailsError).toBeNull();
    expect(details).toHaveLength(2);
  });

  it("他グループのユーザーはレシートを参照できない", async () => {
    const { data } = await outsider.client
      .from("receipts")
      .select("id")
      .eq("group_id", groupId);
    expect(data).toEqual([]);
  });

  it("精算を確定すると、その月のレシート登録がRLSでブロックされる", async () => {
    const periodMonth = "2026-08-01";

    const { data: confirmedBefore } = await userA.client.rpc(
      "is_settlement_confirmed",
      { p_group_id: groupId, p_occurred_at: "2026-08-15T00:00:00Z" }
    );
    expect(confirmedBefore).toBe(false);

    // 一般メンバーは精算を確定できない。
    const { error: memberConfirmError } = await userB.client.rpc(
      "confirm_settlement",
      {
        p_group_id: groupId,
        p_period_month: periodMonth,
        p_user_a_id: userA.id,
        p_user_b_id: userB.id,
        p_user_a_burden: 375,
        p_user_b_burden: 1125,
        p_user_a_paid: 1500,
        p_user_b_paid: 0,
        p_settlement_amount: 375,
        p_settlement_from_user_id: userB.id,
        p_settlement_to_user_id: userA.id,
      }
    );
    expect(memberConfirmError).not.toBeNull();

    // 管理者は精算を確定できる。
    const { error: confirmError } = await userA.client.rpc(
      "confirm_settlement",
      {
        p_group_id: groupId,
        p_period_month: periodMonth,
        p_user_a_id: userA.id,
        p_user_b_id: userB.id,
        p_user_a_burden: 375,
        p_user_b_burden: 1125,
        p_user_a_paid: 1500,
        p_user_b_paid: 0,
        p_settlement_amount: 375,
        p_settlement_from_user_id: userB.id,
        p_settlement_to_user_id: userA.id,
      }
    );
    expect(confirmError).toBeNull();

    const { data: confirmedAfter } = await userA.client.rpc(
      "is_settlement_confirmed",
      { p_group_id: groupId, p_occurred_at: "2026-08-15T00:00:00Z" }
    );
    expect(confirmedAfter).toBe(true);

    // INSERTのRLS拒否はUPDATE/DELETEと異なり、行が見えず0件になるのではなく
    // with checkによる42501エラーとして返る。
    const { error: blockedError } = await userA.client.from("receipts").insert({
      group_id: groupId,
      payee_name: "確定後の登録",
      transaction_type_id: transactionTypeExpenseId,
      occurred_at: "2026-08-20T00:00:00Z",
      payer_user_id: userA.id,
      created_by: userA.id,
      amount: 100,
    });
    expect(blockedError).not.toBeNull();
    expect(blockedError?.code).toBe("42501");
  });

  it("一般メンバーは確定済みの精算を再オープンできない", async () => {
    const { error } = await userB.client.rpc("reopen_settlement", {
      p_group_id: groupId,
      p_period_month: "2026-08-01",
    });
    expect(error).not.toBeNull();
  });

  it("管理者は精算を再オープンでき、以後その月のレシート登録が再び可能になる", async () => {
    const { error: reopenError } = await userA.client.rpc(
      "reopen_settlement",
      { p_group_id: groupId, p_period_month: "2026-08-01" }
    );
    expect(reopenError).toBeNull();

    const { data: confirmedAfterReopen } = await userA.client.rpc(
      "is_settlement_confirmed",
      { p_group_id: groupId, p_occurred_at: "2026-08-15T00:00:00Z" }
    );
    expect(confirmedAfterReopen).toBe(false);

    const { data: allowedInsert, error: allowedError } = await userA.client
      .from("receipts")
      .insert({
        group_id: groupId,
        payee_name: "再オープン後の登録",
        transaction_type_id: transactionTypeExpenseId,
        occurred_at: "2026-08-21T00:00:00Z",
        payer_user_id: userA.id,
        created_by: userA.id,
        amount: 100,
      })
      .select("id");
    expect(allowedError).toBeNull();
    expect(allowedInsert).toHaveLength(1);
  });

  it("返金レシートも支出と同じテーブルへ登録できる", async () => {
    const { error } = await userA.client.from("receipts").insert({
      group_id: groupId,
      payee_name: "返金テスト",
      transaction_type_id: transactionTypeRefundId,
      occurred_at: "2026-08-22T00:00:00Z",
      payer_user_id: userA.id,
      created_by: userA.id,
      amount: 500,
    });
    expect(error).toBeNull();
  });

  it("税別明細は税率(tax_rate_id)必須、税込明細はnullでなければならない", async () => {
    const receiptId = crypto.randomUUID();
    await userA.client.from("receipts").insert({
      id: receiptId,
      group_id: groupId,
      payee_name: "税区分テスト",
      transaction_type_id: transactionTypeExpenseId,
      occurred_at: "2026-08-23T00:00:00Z",
      payer_user_id: userA.id,
      created_by: userA.id,
      amount: 100,
    });

    const { error: missingRateError } = await userA.client
      .from("receipt_details")
      .insert({
        receipt_id: receiptId,
        item_name: "税別なのに税率なし",
        price: 100,
        tax_type: "exclusive",
        tax_rate_id: null,
        category_id: categoryId,
        purpose_id: purposeId,
      });
    expect(missingRateError).not.toBeNull();

    const { error: okError } = await userA.client.from("receipt_details").insert({
      receipt_id: receiptId,
      item_name: "税別で税率あり",
      price: 100,
      tax_type: "exclusive",
      tax_rate_id: taxRate8,
      category_id: categoryId,
      purpose_id: purposeId,
    });
    expect(okError).toBeNull();
  });

  it("支払者は登録者以外にも自由に変更できる（全メンバー可）", async () => {
    const receiptId = crypto.randomUUID();
    await userA.client.from("receipts").insert({
      id: receiptId,
      group_id: groupId,
      payee_name: "支払者変更テスト",
      transaction_type_id: transactionTypeExpenseId,
      occurred_at: "2026-08-24T00:00:00Z",
      payer_user_id: userA.id,
      created_by: userA.id,
      amount: 100,
    });

    // 支払者は登録者本人（userA）以外にも自由に変更できる（従来の
    // receipts_payer_is_creator制約は撤廃済み）。一般メンバーのuserBが変更する。
    const { error: updateError } = await userB.client
      .from("receipts")
      .update({ payer_user_id: userB.id })
      .eq("id", receiptId);
    expect(updateError).toBeNull();

    const { data: updated } = await userA.client
      .from("receipts")
      .select("payer_user_id")
      .eq("id", receiptId)
      .single();
    expect(updated?.payer_user_id).toBe(userB.id);
  });
});
