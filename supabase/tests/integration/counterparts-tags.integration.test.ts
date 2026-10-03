import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// 分析拡充 F2：相手・タグの自動作成・RLS・明細との整合性を検証する
// （docs/分析拡充/基本設計書.md 4章）。
describe("相手・タグ", () => {
  const admin = createServiceRoleClient();

  let owner: TestUser; // グループ管理者
  let member: TestUser; // 一般メンバー
  let outsider: TestUser; // 別グループの管理者
  let groupId: string;
  let otherGroupId: string;
  let foodId: number;
  let expenseTypeId: number;
  let futariId: number; // 既定の相手「ふたり」
  let customId: number; // 任意で追加した相手
  let tagId: number;
  let receiptId: string;

  beforeAll(async () => {
    owner = await createSignedInTestUser(admin, "label-owner");
    member = await createSignedInTestUser(admin, "label-member");
    outsider = await createSignedInTestUser(admin, "label-outsider");

    const { data: group, error: groupError } = await owner.client.rpc("create_group_with_admin", {
      p_name: "相手テストグループ",
    });
    if (groupError) throw groupError;
    groupId = group.id;

    // 招待中（未参加）の時点では、まだメンバーの相手は作られない（参加時に作られる）
    const { error: inviteError } = await owner.client.from("group_members").insert({
      group_id: groupId,
      invited_email: member.email.toLowerCase(),
      role: "member",
    });
    if (inviteError) throw inviteError;
    const { error: linkError } = await member.client.rpc("link_pending_group_memberships");
    if (linkError) throw linkError;

    const { data: otherGroup, error: otherGroupError } = await outsider.client.rpc(
      "create_group_with_admin",
      { p_name: "相手テスト他グループ" }
    );
    if (otherGroupError) throw otherGroupError;
    otherGroupId = otherGroup.id;

    const [{ data: food }, { data: types }, { data: futari }] = await Promise.all([
      admin.from("categories").select("id").eq("name", "食費").single(),
      admin.from("transaction_types").select("id, name"),
      admin
        .from("counterparts")
        .select("id")
        .eq("group_id", groupId)
        .eq("name", "ふたり")
        .single(),
    ]);
    foodId = food!.id;
    expenseTypeId = types!.find((t) => t.name === "支出")!.id;
    futariId = futari!.id;

    receiptId = crypto.randomUUID();
    const { error: receiptError } = await member.client.from("receipts").insert({
      id: receiptId,
      group_id: groupId,
      payee_name: "相手テスト",
      transaction_type_id: expenseTypeId,
      occurred_at: "2026-09-10T03:00:00Z",
      payer_user_id: member.id,
      created_by: member.id,
      amount: 1000,
    });
    if (receiptError) throw receiptError;
  });

  afterAll(async () => {
    await admin.from("receipts").delete().eq("group_id", groupId);
    await deleteTestUser(admin, owner.id);
    await deleteTestUser(admin, member.id);
    await deleteTestUser(admin, outsider.id);
  });

  it("I-36: グループ作成時に既定の相手、参加時にメンバーの相手が作られる", async () => {
    const { data } = await admin
      .from("counterparts")
      .select("kind, user_id, name")
      .eq("group_id", groupId)
      .order("sort_order")
      .order("id");
    expect(data).toEqual([
      { kind: "member", user_id: owner.id, name: null },
      { kind: "member", user_id: member.id, name: null },
      { kind: "default", user_id: null, name: "ふたり" },
      { kind: "default", user_id: null, name: "友人" },
      { kind: "default", user_id: null, name: "実家" },
    ]);
  });

  it("I-37: 任意の相手は管理者だけが追加でき、既定の相手は追加・名前の変更・削除ができない", async () => {
    const { data, error } = await owner.client
      .from("counterparts")
      .insert({ group_id: groupId, kind: "custom", name: "同僚" })
      .select("id")
      .single();
    expect(error).toBeNull();
    customId = data!.id;

    const { error: memberError } = await member.client
      .from("counterparts")
      .insert({ group_id: groupId, kind: "custom", name: "近所" });
    expect(memberError).not.toBeNull();

    const { error: defaultInsertError } = await owner.client
      .from("counterparts")
      .insert({ group_id: groupId, kind: "default", name: "親戚" });
    expect(defaultInsertError).not.toBeNull();

    const { error: renameError } = await owner.client
      .from("counterparts")
      .update({ name: "二人" })
      .eq("id", futariId);
    expect(renameError).not.toBeNull();

    const { data: deleted } = await owner.client
      .from("counterparts")
      .delete()
      .eq("id", futariId)
      .select("id");
    expect(deleted ?? []).toEqual([]);

    // 表示・非表示は切り替えられる
    const { error: hideError } = await owner.client
      .from("counterparts")
      .update({ is_hidden: true })
      .eq("id", futariId);
    expect(hideError).toBeNull();
    await owner.client.from("counterparts").update({ is_hidden: false }).eq("id", futariId);
  });

  it("I-38: タグは管理者だけが追加でき、一般メンバーは読めるが追加できない。他グループは読めない", async () => {
    const { data, error } = await owner.client
      .from("tags")
      .insert({ group_id: groupId, name: "朝食" })
      .select("id")
      .single();
    expect(error).toBeNull();
    tagId = data!.id;

    const { error: memberError } = await member.client
      .from("tags")
      .insert({ group_id: groupId, name: "昼食" });
    expect(memberError).not.toBeNull();

    const { data: memberRows } = await member.client.from("tags").select("id").eq("group_id", groupId);
    expect(memberRows).toHaveLength(1);

    const { data: outsiderTags } = await outsider.client
      .from("tags")
      .select("id")
      .eq("group_id", groupId);
    expect(outsiderTags).toEqual([]);
    const { data: outsiderCounterparts } = await outsider.client
      .from("counterparts")
      .select("id")
      .eq("group_id", groupId);
    expect(outsiderCounterparts).toEqual([]);
  });

  it("I-39: 明細の相手・タグは、レシートのグループのものでなければDBで拒否される", async () => {
    const [{ data: otherCounterpart }, { data: otherTag }] = await Promise.all([
      admin
        .from("counterparts")
        .select("id")
        .eq("group_id", otherGroupId)
        .eq("name", "ふたり")
        .single(),
      admin.from("tags").insert({ group_id: otherGroupId, name: "他タグ" }).select("id").single(),
    ]);

    const base = {
      receipt_id: receiptId,
      item_name: "テスト",
      price: 1000,
      tax_type: "inclusive",
      category_id: foodId,
      owner_user_id: null,
    };
    const { error: mismatchError } = await member.client
      .from("receipt_details")
      .insert({ ...base, counterpart_id: otherCounterpart!.id });
    expect(mismatchError).not.toBeNull();

    const { data: detail, error: okError } = await member.client
      .from("receipt_details")
      .insert({ ...base, counterpart_id: customId })
      .select("id")
      .single();
    expect(okError).toBeNull();

    const { error: otherTagError } = await member.client
      .from("receipt_detail_tags")
      .insert({ receipt_detail_id: detail!.id, tag_id: otherTag!.id });
    expect(otherTagError).not.toBeNull();

    const { error: tagError } = await member.client
      .from("receipt_detail_tags")
      .insert({ receipt_detail_id: detail!.id, tag_id: tagId });
    expect(tagError).toBeNull();
  });

  it("I-40: 明細で使われている相手・タグは削除できず、非表示にはできる", async () => {
    const { error: counterpartDeleteError } = await owner.client
      .from("counterparts")
      .delete()
      .eq("id", customId);
    expect(counterpartDeleteError?.code).toBe("23503");

    const { error: tagDeleteError } = await owner.client.from("tags").delete().eq("id", tagId);
    expect(tagDeleteError?.code).toBe("23503");

    const { error: hideError } = await owner.client
      .from("tags")
      .update({ is_hidden: true })
      .eq("id", tagId);
    expect(hideError).toBeNull();
  });
});
