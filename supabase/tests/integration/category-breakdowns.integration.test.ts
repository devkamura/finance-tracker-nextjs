import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// 分析拡充 F1：カテゴリの内訳・費用区分のRLSと、明細の内訳の整合性を検証する
// （docs/分析拡充/基本設計書.md 4章）。
describe("カテゴリの内訳・費用区分", () => {
  const admin = createServiceRoleClient();

  let owner: TestUser; // グループ管理者
  let member: TestUser; // 一般メンバー
  let outsider: TestUser; // 別グループの管理者
  let groupId: string;
  let foodId: number;
  let dailyId: number;
  let counterpartId: number;
  let expenseTypeId: number;
  let foodBreakdownId: number;

  beforeAll(async () => {
    owner = await createSignedInTestUser(admin, "breakdown-owner");
    member = await createSignedInTestUser(admin, "breakdown-member");
    outsider = await createSignedInTestUser(admin, "breakdown-outsider");

    const { data: group, error: groupError } = await owner.client.rpc("create_group_with_admin", {
      p_name: "内訳テストグループ",
    });
    if (groupError) throw groupError;
    groupId = group.id;

    const { error: inviteError } = await owner.client.from("group_members").insert({
      group_id: groupId,
      invited_email: member.email.toLowerCase(),
      role: "member",
    });
    if (inviteError) throw inviteError;
    const { error: linkError } = await member.client.rpc("link_pending_group_memberships");
    if (linkError) throw linkError;

    await outsider.client.rpc("create_group_with_admin", { p_name: "内訳テスト他グループ" });

    const [{ data: food }, { data: daily }, { data: counterpart }, { data: types }] = await Promise.all([
      admin.from("categories").select("id").eq("name", "食費").single(),
      admin.from("categories").select("id").eq("name", "日用品").single(),
      admin.from("counterparts").select("id").eq("group_id", groupId).eq("name", "ふたり").single(),
      admin.from("transaction_types").select("id, name"),
    ]);
    foodId = food!.id;
    dailyId = daily!.id;
    counterpartId = counterpart!.id;
    expenseTypeId = types!.find((t) => t.name === "支出")!.id;
  });

  afterAll(async () => {
    await admin.from("receipts").delete().eq("group_id", groupId);
    await deleteTestUser(admin, owner.id);
    await deleteTestUser(admin, member.id);
    await deleteTestUser(admin, outsider.id);
  });

  it("I-32: 管理者は内訳を追加でき、一般メンバーは追加できない", async () => {
    const { data, error } = await owner.client
      .from("category_breakdowns")
      .insert({ group_id: groupId, category_id: foodId, name: "外食" })
      .select("id")
      .single();
    expect(error).toBeNull();
    foodBreakdownId = data!.id;

    const { error: memberError } = await member.client
      .from("category_breakdowns")
      .insert({ group_id: groupId, category_id: foodId, name: "自炊" });
    expect(memberError).not.toBeNull();
  });

  it("I-32: 一般メンバーは内訳を読めるが、他グループのユーザーは読めない", async () => {
    const { data: memberRows } = await member.client
      .from("category_breakdowns")
      .select("id")
      .eq("group_id", groupId);
    expect(memberRows).toHaveLength(1);

    const { data: outsiderRows } = await outsider.client
      .from("category_breakdowns")
      .select("id")
      .eq("group_id", groupId);
    expect(outsiderRows).toEqual([]);
  });

  it("I-33: 費用区分は管理者だけが保存でき、一般メンバーは保存できない", async () => {
    const { error } = await owner.client
      .from("category_settings")
      .upsert({ group_id: groupId, category_id: foodId, cost_type: "fixed" });
    expect(error).toBeNull();

    // 一般メンバーの書き込みはRLSで0件になる（またはエラー）
    const { data: memberUpdated } = await member.client
      .from("category_settings")
      .update({ cost_type: "variable" })
      .eq("group_id", groupId)
      .eq("category_id", foodId)
      .select("category_id");
    expect(memberUpdated ?? []).toEqual([]);

    const { data } = await admin
      .from("category_settings")
      .select("cost_type")
      .eq("group_id", groupId)
      .eq("category_id", foodId)
      .single();
    expect(data!.cost_type).toBe("fixed");
  });

  it("I-34: 明細の内訳は、明細のカテゴリの内訳でなければDBで拒否される", async () => {
    const receiptId = crypto.randomUUID();
    const { error: receiptError } = await member.client.from("receipts").insert({
      id: receiptId,
      group_id: groupId,
      payee_name: "内訳テスト",
      transaction_type_id: expenseTypeId,
      occurred_at: "2026-09-10T03:00:00Z",
      payer_user_id: member.id,
      created_by: member.id,
      amount: 1000,
    });
    expect(receiptError).toBeNull();

    const base = {
      receipt_id: receiptId,
      item_name: "テスト",
      price: 1000,
      tax_type: "inclusive",
      counterpart_id: counterpartId,
      owner_user_id: null,
    };
    // 日用品の明細に、食費の内訳を付けることはできない
    const { error: mismatchError } = await member.client
      .from("receipt_details")
      .insert({ ...base, category_id: dailyId, breakdown_id: foodBreakdownId });
    expect(mismatchError).not.toBeNull();

    // 食費の明細には付けられる
    const { error: okError } = await member.client
      .from("receipt_details")
      .insert({ ...base, category_id: foodId, breakdown_id: foodBreakdownId });
    expect(okError).toBeNull();
  });

  it("I-35: 明細で使われている内訳は削除できず、非表示にはできる", async () => {
    const { error: deleteError } = await owner.client
      .from("category_breakdowns")
      .delete()
      .eq("id", foodBreakdownId);
    expect(deleteError?.code).toBe("23503");

    const { error: hideError } = await owner.client
      .from("category_breakdowns")
      .update({ is_hidden: true })
      .eq("id", foodBreakdownId);
    expect(hideError).toBeNull();
  });
});
