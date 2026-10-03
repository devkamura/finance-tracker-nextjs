import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// 分析拡充 F3：支払い先のグループ全体／自分用の権限（RLS）・名前の重複・既定値の整合性を検証する
// （docs/分析拡充/基本設計書.md 4章）。
describe("支払い先", () => {
  const admin = createServiceRoleClient();

  let owner: TestUser; // グループ管理者
  let member: TestUser; // 一般メンバー
  let outsider: TestUser; // 別グループの管理者
  let groupId: string;
  let otherGroupId: string;
  let foodId: number;
  let utilityId: number;
  let expenseTypeId: number;
  let gasBreakdownId: number; // 水道光熱費 ＞ ガス
  let futariId: number;
  let otherFutariId: number; // 別グループの「ふたり」
  let sharedPayeeId: number; // グループ全体
  let memberPayeeId: number; // 一般メンバーの自分用

  beforeAll(async () => {
    owner = await createSignedInTestUser(admin, "payee-owner");
    member = await createSignedInTestUser(admin, "payee-member");
    outsider = await createSignedInTestUser(admin, "payee-outsider");

    const { data: group, error: groupError } = await owner.client.rpc("create_group_with_admin", {
      p_name: "支払い先テストグループ",
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

    const { data: otherGroup, error: otherGroupError } = await outsider.client.rpc(
      "create_group_with_admin",
      { p_name: "支払い先テスト他グループ" }
    );
    if (otherGroupError) throw otherGroupError;
    otherGroupId = otherGroup.id;

    const [{ data: food }, { data: utility }, { data: types }, { data: futari }, { data: otherFutari }] =
      await Promise.all([
        admin.from("categories").select("id").eq("name", "食費").single(),
        admin.from("categories").select("id").eq("name", "水道光熱費").single(),
        admin.from("transaction_types").select("id, name"),
        admin.from("counterparts").select("id").eq("group_id", groupId).eq("name", "ふたり").single(),
        admin
          .from("counterparts")
          .select("id")
          .eq("group_id", otherGroupId)
          .eq("name", "ふたり")
          .single(),
      ]);
    foodId = food!.id;
    utilityId = utility!.id;
    expenseTypeId = types!.find((t) => t.name === "支出")!.id;
    futariId = futari!.id;
    otherFutariId = otherFutari!.id;

    const { data: gas, error: gasError } = await owner.client
      .from("category_breakdowns")
      .insert({ group_id: groupId, category_id: utilityId, name: "ガス" })
      .select("id")
      .single();
    if (gasError) throw gasError;
    gasBreakdownId = gas.id;
  });

  afterAll(async () => {
    // 支払い先はレシートから参照されるため、先にレシートを消す
    await admin.from("receipts").delete().in("group_id", [groupId, otherGroupId]);
    await admin.from("payees").delete().in("group_id", [groupId, otherGroupId]);
    await admin.from("tags").delete().in("group_id", [groupId, otherGroupId]);
    await deleteTestUser(admin, owner.id);
    await deleteTestUser(admin, member.id);
    await deleteTestUser(admin, outsider.id);
  });

  it("I-41: グループ全体の支払い先は管理者だけ、自分用は本人だけが追加・変更・削除できる", async () => {
    const { data: shared, error: sharedError } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "myTOKYOGAS" })
      .select("id")
      .single();
    expect(sharedError).toBeNull();
    sharedPayeeId = shared!.id;

    // 一般メンバーはグループ全体の支払い先を追加・変更できない
    const { error: memberSharedError } = await member.client
      .from("payees")
      .insert({ group_id: groupId, name: "スーパー" });
    expect(memberSharedError).not.toBeNull();
    const { data: memberUpdated } = await member.client
      .from("payees")
      .update({ name: "変更" })
      .eq("id", sharedPayeeId)
      .select("id");
    expect(memberUpdated ?? []).toEqual([]);

    // 一般メンバーは自分用を追加できる。他の人の自分用としては追加できない
    const { data: own, error: ownError } = await member.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: member.id, name: "〇〇薬局" })
      .select("id")
      .single();
    expect(ownError).toBeNull();
    memberPayeeId = own!.id;
    const { error: impersonateError } = await member.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: owner.id, name: "なりすまし" });
    expect(impersonateError).not.toBeNull();

    // 相方（管理者でも）は、一般メンバーの自分用を読めるが変更・削除できない
    const { data: ownerRead } = await owner.client.from("payees").select("id").eq("id", memberPayeeId);
    expect(ownerRead).toHaveLength(1);
    const { data: ownerUpdated } = await owner.client
      .from("payees")
      .update({ is_hidden: true })
      .eq("id", memberPayeeId)
      .select("id");
    expect(ownerUpdated ?? []).toEqual([]);
    const { data: ownerDeleted } = await owner.client
      .from("payees")
      .delete()
      .eq("id", memberPayeeId)
      .select("id");
    expect(ownerDeleted ?? []).toEqual([]);

    // 本人は変更できる。グループ全体の支払い先には変えられない（登録者は変えられない）
    const { data: renamed } = await member.client
      .from("payees")
      .update({ name: "〇〇ドラッグ" })
      .eq("id", memberPayeeId)
      .select("name");
    expect(renamed).toEqual([{ name: "〇〇ドラッグ" }]);
    const { error: ownerChangeError } = await member.client
      .from("payees")
      .update({ owner_user_id: owner.id })
      .eq("id", memberPayeeId);
    expect(ownerChangeError).not.toBeNull();

    // 他グループからは読めず、他グループに自分用を追加することもできない
    const { data: outsiderRead } = await outsider.client
      .from("payees")
      .select("id")
      .eq("group_id", groupId);
    expect(outsiderRead).toEqual([]);
    const { error: outsiderOwnError } = await outsider.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: outsider.id, name: "他グループから" });
    expect(outsiderOwnError).not.toBeNull();
  });

  it("I-42: 同じ一覧の中、グループ全体と自分用の間では名前が重複できず、ユーザーどうしの自分用では重複できる", async () => {
    // グループ全体どうし
    const { error: sharedDup } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "myTOKYOGAS" });
    expect(sharedDup?.code).toBe("23505");

    // グループ全体にある名前は、自分用に登録できない（管理者・一般メンバーとも）
    const { error: ownerOwnSameAsShared } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: owner.id, name: "myTOKYOGAS" });
    expect(ownerOwnSameAsShared?.code).toBe("23505");
    expect(ownerOwnSameAsShared?.message).toContain("conflicts with a shared payee");
    const { error: memberOwnSameAsShared } = await member.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: member.id, name: "myTOKYOGAS" });
    expect(memberOwnSameAsShared?.code).toBe("23505");

    // ユーザーどうしの自分用は同じ名前でよい
    const { error: ownerOwn } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: owner.id, name: "近所の店" });
    expect(ownerOwn).toBeNull();
    const { data: memberOwn, error: memberOwnError } = await member.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: member.id, name: "近所の店" })
      .select("id")
      .single();
    expect(memberOwnError).toBeNull();

    // 同じユーザーの自分用どうし
    const { error: ownDup } = await member.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: member.id, name: "近所の店" });
    expect(ownDup?.code).toBe("23505");

    // 誰かの自分用にある名前は、グループ全体に登録できない
    const { error: sharedSameAsOwn } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "近所の店" });
    expect(sharedSameAsOwn?.code).toBe("23505");
    expect(sharedSameAsOwn?.message).toContain("conflicts with an own payee");

    // 名前の変更でも同じ
    const { error: renameError } = await member.client
      .from("payees")
      .update({ name: "myTOKYOGAS" })
      .eq("id", memberOwn!.id);
    expect(renameError?.code).toBe("23505");
  });

  it("I-43: 既定値は、カテゴリの内訳・グループの相手・グループのメンバーでなければDBで拒否される", async () => {
    // 正しい既定値は保存できる
    const { error: okError } = await owner.client
      .from("payees")
      .update({
        default_category_id: utilityId,
        default_breakdown_id: gasBreakdownId,
        default_counterpart_id: futariId,
        default_owner_joint: true,
      })
      .eq("id", sharedPayeeId);
    expect(okError).toBeNull();

    // 既定値のカテゴリと違うカテゴリの内訳
    const { error: breakdownError } = await owner.client
      .from("payees")
      .update({ default_category_id: foodId, default_breakdown_id: gasBreakdownId })
      .eq("id", sharedPayeeId);
    expect(breakdownError).not.toBeNull();

    // カテゴリなしの内訳
    const { error: noCategoryError } = await owner.client
      .from("payees")
      .update({ default_category_id: null, default_breakdown_id: gasBreakdownId })
      .eq("id", sharedPayeeId);
    expect(noCategoryError).not.toBeNull();

    // 他グループの相手
    const { error: counterpartError } = await owner.client
      .from("payees")
      .update({ default_counterpart_id: otherFutariId })
      .eq("id", sharedPayeeId);
    expect(counterpartError).not.toBeNull();

    // グループのメンバーでない帰属先、共同とメンバーの両方
    const { error: ownerError } = await owner.client
      .from("payees")
      .update({ default_owner_joint: false, default_owner_user_id: outsider.id })
      .eq("id", sharedPayeeId);
    expect(ownerError).not.toBeNull();
    const { error: bothError } = await owner.client
      .from("payees")
      .update({ default_owner_joint: true, default_owner_user_id: member.id })
      .eq("id", sharedPayeeId);
    expect(bothError).not.toBeNull();

    const { data } = await admin
      .from("payees")
      .select("default_category_id, default_breakdown_id, default_counterpart_id, default_owner_joint, default_owner_user_id")
      .eq("id", sharedPayeeId)
      .single();
    expect(data).toEqual({
      default_category_id: utilityId,
      default_breakdown_id: gasBreakdownId,
      default_counterpart_id: futariId,
      default_owner_joint: true,
      default_owner_user_id: null,
    });
  });

  it("I-44: 既定値の内訳を削除すると、支払い先の内訳の既定値だけが空になる", async () => {
    const { data: temp } = await owner.client
      .from("category_breakdowns")
      .insert({ group_id: groupId, category_id: utilityId, name: "電気" })
      .select("id")
      .single();
    await owner.client
      .from("payees")
      .update({ default_breakdown_id: temp!.id })
      .eq("id", sharedPayeeId);

    const { error: deleteError } = await owner.client
      .from("category_breakdowns")
      .delete()
      .eq("id", temp!.id);
    expect(deleteError).toBeNull();

    const { data } = await admin
      .from("payees")
      .select("default_category_id, default_breakdown_id")
      .eq("id", sharedPayeeId)
      .single();
    expect(data).toEqual({ default_category_id: utilityId, default_breakdown_id: null });
  });

  it("I-45: レシートで使われている支払い先は削除できず、非表示にはできる", async () => {
    const { error: receiptError } = await member.client.from("receipts").insert({
      id: crypto.randomUUID(),
      group_id: groupId,
      payee_id: memberPayeeId,
      payee_name: "〇〇ドラッグ",
      transaction_type_id: expenseTypeId,
      occurred_at: "2026-09-10T03:00:00Z",
      payer_user_id: member.id,
      created_by: member.id,
      amount: 1000,
    });
    expect(receiptError).toBeNull();

    const { error: deleteError } = await member.client
      .from("payees")
      .delete()
      .eq("id", memberPayeeId);
    expect(deleteError?.code).toBe("23503");

    const { data: hidden, error: hideError } = await member.client
      .from("payees")
      .update({ is_hidden: true })
      .eq("id", memberPayeeId)
      .select("is_hidden");
    expect(hideError).toBeNull();
    expect(hidden).toEqual([{ is_hidden: true }]);
  });

  it("I-46: 既定値のタグは支払い先と同じ権限で設定でき、他グループのタグは拒否され、タグを削除すると既定値から外れる", async () => {
    const [{ data: tag }, { data: otherTag }] = await Promise.all([
      member.client.from("tags").insert({ group_id: groupId, name: "支払い先テストタグ" }).select("id").single(),
      outsider.client.from("tags").insert({ group_id: otherGroupId, name: "他グループタグ" }).select("id").single(),
    ]);

    // グループ全体の支払い先：管理者は設定でき、一般メンバーは設定できない
    const { error: ownerError } = await owner.client
      .from("payee_default_tags")
      .insert({ payee_id: sharedPayeeId, tag_id: tag!.id });
    expect(ownerError).toBeNull();
    const { error: memberSharedError } = await member.client
      .from("payee_default_tags")
      .insert({ payee_id: sharedPayeeId, tag_id: tag!.id });
    expect(memberSharedError).not.toBeNull();

    // 自分用の支払い先：本人は設定でき、相方（管理者）は設定できない
    const { error: memberOwnError } = await member.client
      .from("payee_default_tags")
      .insert({ payee_id: memberPayeeId, tag_id: tag!.id });
    expect(memberOwnError).toBeNull();
    const { data: ownerDeleted } = await owner.client
      .from("payee_default_tags")
      .delete()
      .eq("payee_id", memberPayeeId)
      .select("tag_id");
    expect(ownerDeleted ?? []).toEqual([]);

    // 他グループのタグは設定できない
    const { error: otherTagError } = await owner.client
      .from("payee_default_tags")
      .insert({ payee_id: sharedPayeeId, tag_id: otherTag!.id });
    expect(otherTagError).not.toBeNull();

    // 他グループからは読めない
    const { data: outsiderRead } = await outsider.client
      .from("payee_default_tags")
      .select("tag_id")
      .eq("payee_id", sharedPayeeId);
    expect(outsiderRead).toEqual([]);

    // タグを削除すると、支払い先の既定値からも外れる（明細で使われていないタグ）
    const { error: deleteError } = await member.client.from("tags").delete().eq("id", tag!.id);
    expect(deleteError).toBeNull();
    const { data: remaining } = await admin
      .from("payee_default_tags")
      .select("payee_id")
      .eq("tag_id", tag!.id);
    expect(remaining).toEqual([]);
  });
});
