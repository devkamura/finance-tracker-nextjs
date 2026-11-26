import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";
import { REGISTRANT_VALUE } from "@/lib/constants";
import { PAYEE_SELECT, toPayee, type PayeeRow } from "@/lib/receipts/payees";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// 支払い先の権限（RLS）・メンバーごとの非表示・名前の重複・既定値の整合性を検証する
// （docs/requirements.md「追加機能：支払い先の一本化」、docs/分析拡充/基本設計書.md 4章）。
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
  let sharedPayeeId: number; // 管理者が登録した支払い先
  let memberPayeeId: number; // 一般メンバーが登録した支払い先

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

  it("I-41: 支払い先は、管理者でも一般メンバーでも追加・変更・削除でき、他グループからは読み書きできない", async () => {
    const { data: shared, error: sharedError } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "myTOKYOGAS" })
      .select("id")
      .single();
    expect(sharedError).toBeNull();
    sharedPayeeId = shared!.id;

    // 一般メンバーも追加できる
    const { data: own, error: ownError } = await member.client
      .from("payees")
      .insert({ group_id: groupId, name: "〇〇薬局" })
      .select("id")
      .single();
    expect(ownError).toBeNull();
    memberPayeeId = own!.id;

    // 一般メンバーは、管理者が登録した支払い先も変更できる（逆も同じ）
    const { data: memberUpdated } = await member.client
      .from("payees")
      .update({ name: "myTOKYOGAS（変更）" })
      .eq("id", sharedPayeeId)
      .select("name");
    expect(memberUpdated).toEqual([{ name: "myTOKYOGAS（変更）" }]);
    const { data: ownerUpdated } = await owner.client
      .from("payees")
      .update({ name: "〇〇ドラッグ" })
      .eq("id", memberPayeeId)
      .select("name");
    expect(ownerUpdated).toEqual([{ name: "〇〇ドラッグ" }]);
    await owner.client.from("payees").update({ name: "myTOKYOGAS" }).eq("id", sharedPayeeId);

    // 一般メンバーは、管理者が登録した支払い先も削除できる
    const { data: temp } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "削除用" })
      .select("id")
      .single();
    const { data: memberDeleted } = await member.client
      .from("payees")
      .delete()
      .eq("id", temp!.id)
      .select("id");
    expect(memberDeleted).toHaveLength(1);

    // 支払い先のグループは変えられない
    const { error: groupChangeError } = await member.client
      .from("payees")
      .update({ group_id: otherGroupId })
      .eq("id", memberPayeeId);
    expect(groupChangeError).not.toBeNull();

    // 他グループからは読めず、追加・変更・削除もできない
    const { data: outsiderRead } = await outsider.client
      .from("payees")
      .select("id")
      .eq("group_id", groupId);
    expect(outsiderRead).toEqual([]);
    const { error: outsiderInsertError } = await outsider.client
      .from("payees")
      .insert({ group_id: groupId, name: "他グループから" });
    expect(outsiderInsertError).not.toBeNull();
    const { data: outsiderUpdated } = await outsider.client
      .from("payees")
      .update({ name: "他グループから変更" })
      .eq("id", sharedPayeeId)
      .select("id");
    expect(outsiderUpdated ?? []).toEqual([]);
    const { data: outsiderDeleted } = await outsider.client
      .from("payees")
      .delete()
      .eq("id", sharedPayeeId)
      .select("id");
    expect(outsiderDeleted ?? []).toEqual([]);
  });

  it("I-42: 名前はグループの中で重複できず（誰が登録しても）、他グループとは重複できる", async () => {
    const { error: sameUserDup } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "myTOKYOGAS" });
    expect(sameUserDup?.code).toBe("23505");

    // 相方が登録した名前も登録できない
    const { error: partnerDup } = await member.client
      .from("payees")
      .insert({ group_id: groupId, name: "myTOKYOGAS" });
    expect(partnerDup?.code).toBe("23505");

    // 名前の変更でも同じ
    const { error: renameError } = await member.client
      .from("payees")
      .update({ name: "myTOKYOGAS" })
      .eq("id", memberPayeeId);
    expect(renameError?.code).toBe("23505");

    // 他グループには同じ名前を登録できる
    const { error: otherGroupError } = await outsider.client
      .from("payees")
      .insert({ group_id: otherGroupId, name: "myTOKYOGAS" });
    expect(otherGroupError).toBeNull();
  });

  it("I-53: 表示／非表示は自分の分だけ切り替えられ、相方・他グループの分は変えられない", async () => {
    // 新しく登録した支払い先は、誰も非表示にしていない（全員に表示）
    const { data: initial } = await owner.client
      .from("payee_hidden_members")
      .select("user_id")
      .eq("payee_id", sharedPayeeId);
    expect(initial).toEqual([]);

    // 一般メンバーが自分の分を非表示にする。相方（管理者）からも読める
    const { error: hideError } = await member.client
      .from("payee_hidden_members")
      .insert({ payee_id: sharedPayeeId, user_id: member.id });
    expect(hideError).toBeNull();
    const { data: ownerRead } = await owner.client
      .from("payee_hidden_members")
      .select("user_id")
      .eq("payee_id", sharedPayeeId);
    expect(ownerRead).toEqual([{ user_id: member.id }]);

    // 相方の分は非表示にできず、相方の非表示を消すこともできない（管理者でも）
    const { error: forPartnerError } = await member.client
      .from("payee_hidden_members")
      .insert({ payee_id: sharedPayeeId, user_id: owner.id });
    expect(forPartnerError).not.toBeNull();
    const { data: ownerDeleted } = await owner.client
      .from("payee_hidden_members")
      .delete()
      .eq("payee_id", sharedPayeeId)
      .eq("user_id", member.id)
      .select("user_id");
    expect(ownerDeleted ?? []).toEqual([]);

    // 他グループからは読めず、他グループの支払い先を非表示にすることもできない
    const { data: outsiderRead } = await outsider.client
      .from("payee_hidden_members")
      .select("user_id")
      .eq("payee_id", sharedPayeeId);
    expect(outsiderRead).toEqual([]);
    const { error: outsiderHideError } = await outsider.client
      .from("payee_hidden_members")
      .insert({ payee_id: sharedPayeeId, user_id: outsider.id });
    expect(outsiderHideError).not.toBeNull();

    // 本人は表示に戻せる
    const { data: unhidden } = await member.client
      .from("payee_hidden_members")
      .delete()
      .eq("payee_id", sharedPayeeId)
      .eq("user_id", member.id)
      .select("user_id");
    expect(unhidden).toHaveLength(1);
  });

  it("I-43: 既定値は、カテゴリの内訳・グループの相手・グループのメンバーでなければDBで拒否され、登録後もメンバー全員が変更できる", async () => {
    // 正しい既定値で登録できる（登録したときの内容が共通の既定値になる）
    const { data: created, error: okError } = await owner.client
      .from("payees")
      .insert({
        group_id: groupId,
        name: "既定値テスト",
        default_category_id: utilityId,
        default_breakdown_id: gasBreakdownId,
        default_counterpart_id: futariId,
        default_owner_joint: true,
        default_item_name: "ガス代",
      })
      .select("id")
      .single();
    expect(okError).toBeNull();

    const insertWith = (name: string, values: Record<string, unknown>) =>
      owner.client.from("payees").insert({ group_id: groupId, name, ...values });

    // 既定値のカテゴリと違うカテゴリの内訳
    const { error: breakdownError } = await insertWith("不正1", {
      default_category_id: foodId,
      default_breakdown_id: gasBreakdownId,
    });
    expect(breakdownError).not.toBeNull();
    // カテゴリなしの内訳
    const { error: noCategoryError } = await insertWith("不正2", {
      default_breakdown_id: gasBreakdownId,
    });
    expect(noCategoryError).not.toBeNull();
    // 他グループの相手
    const { error: counterpartError } = await insertWith("不正3", {
      default_counterpart_id: otherFutariId,
    });
    expect(counterpartError).not.toBeNull();
    // グループのメンバーでない帰属先、共同とメンバーの両方
    const { error: ownerError } = await insertWith("不正4", {
      default_owner_user_id: outsider.id,
    });
    expect(ownerError).not.toBeNull();
    const { error: bothError } = await insertWith("不正5", {
      default_owner_joint: true,
      default_owner_user_id: member.id,
    });
    expect(bothError).not.toBeNull();

    // 登録後も、一般メンバーが共通の既定値を変更できる（変更後も整合性は確かめる）。名前も変更できる
    const { error: memberInvalidError } = await member.client
      .from("payees")
      .update({ default_category_id: foodId })
      .eq("id", created!.id);
    expect(memberInvalidError).not.toBeNull(); // 食費とガスの内訳の組み合わせは不正
    const { error: memberChangeError } = await member.client
      .from("payees")
      .update({
        default_counterpart_id: null,
        default_owner_joint: false,
        default_owner_user_id: member.id,
        default_item_name: "ガス料金",
      })
      .eq("id", created!.id);
    expect(memberChangeError).toBeNull();
    const { error: renameError } = await member.client
      .from("payees")
      .update({ name: "既定値テスト（改名）" })
      .eq("id", created!.id);
    expect(renameError).toBeNull();
    // 他グループからは変更できない
    const { data: outsiderUpdated } = await outsider.client
      .from("payees")
      .update({ default_item_name: "他グループ" })
      .eq("id", created!.id)
      .select("id");
    expect(outsiderUpdated ?? []).toEqual([]);
    // 管理者も変更できる（変更を戻して、下で登録時の値を確かめる）
    const { error: adminRevertError } = await owner.client
      .from("payees")
      .update({
        default_counterpart_id: futariId,
        default_owner_joint: true,
        default_owner_user_id: null,
        default_item_name: "ガス代",
      })
      .eq("id", created!.id);
    expect(adminRevertError).toBeNull();

    const { data } = await admin
      .from("payees")
      .select("default_category_id, default_breakdown_id, default_counterpart_id, default_owner_joint, default_owner_user_id, default_item_name")
      .eq("id", created!.id)
      .single();
    expect(data).toEqual({
      default_category_id: utilityId,
      default_breakdown_id: gasBreakdownId,
      default_counterpart_id: futariId,
      default_owner_joint: true,
      default_owner_user_id: null,
      default_item_name: "ガス代",
    });
  });

  it("I-44: 既定値の内訳を削除すると、共通・自分用とも内訳の既定値だけが空になる", async () => {
    const { data: temp } = await owner.client
      .from("category_breakdowns")
      .insert({ group_id: groupId, category_id: utilityId, name: "電気" })
      .select("id")
      .single();
    const { data: payee, error: payeeError } = await owner.client
      .from("payees")
      .insert({
        group_id: groupId,
        name: "内訳削除テスト",
        default_category_id: utilityId,
        default_breakdown_id: temp!.id,
      })
      .select("id")
      .single();
    expect(payeeError).toBeNull();
    const { error: ownError } = await member.client.from("payee_member_defaults").insert({
      payee_id: payee!.id,
      user_id: member.id,
      default_category_id: utilityId,
      default_breakdown_id: temp!.id,
    });
    expect(ownError).toBeNull();

    const { error: deleteError } = await owner.client
      .from("category_breakdowns")
      .delete()
      .eq("id", temp!.id);
    expect(deleteError).toBeNull();

    const [{ data: common }, { data: own }] = await Promise.all([
      admin
        .from("payees")
        .select("default_category_id, default_breakdown_id")
        .eq("id", payee!.id)
        .single(),
      admin
        .from("payee_member_defaults")
        .select("default_category_id, default_breakdown_id")
        .eq("payee_id", payee!.id)
        .eq("user_id", member.id)
        .single(),
    ]);
    expect(common).toEqual({ default_category_id: utilityId, default_breakdown_id: null });
    expect(own).toEqual({ default_category_id: utilityId, default_breakdown_id: null });
  });

  it("I-45: レシートで使われている支払い先は誰も削除できず、自分の分を非表示にはできる", async () => {
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

    // 相方も削除できない（使われているため）。使わない人は自分の分を非表示にできる
    const { error: partnerDeleteError } = await owner.client
      .from("payees")
      .delete()
      .eq("id", memberPayeeId);
    expect(partnerDeleteError?.code).toBe("23503");
    const { error: hideError } = await owner.client
      .from("payee_hidden_members")
      .insert({ payee_id: memberPayeeId, user_id: owner.id });
    expect(hideError).toBeNull();
  });

  it("I-46: 既定値のタグはメンバー全員が設定・入れ替え（削除）でき、他グループのタグは拒否され、タグを削除すると既定値から外れる", async () => {
    const [{ data: tag }, { data: otherTag }] = await Promise.all([
      member.client.from("tags").insert({ group_id: groupId, name: "支払い先テストタグ" }).select("id").single(),
      outsider.client.from("tags").insert({ group_id: otherGroupId, name: "他グループタグ" }).select("id").single(),
    ]);

    // 一般メンバーも、管理者が登録した支払い先の既定値のタグを登録できる
    const { error: memberError } = await member.client
      .from("payee_default_tags")
      .insert({ payee_id: sharedPayeeId, tag_id: tag!.id });
    expect(memberError).toBeNull();
    // 一般メンバーも消せる（入れ替えのため）。確かめた後、元に戻す
    const { data: memberDeleted } = await member.client
      .from("payee_default_tags")
      .delete()
      .eq("payee_id", sharedPayeeId)
      .select("tag_id");
    expect(memberDeleted).toHaveLength(1);
    // 他グループからは消せない
    const { data: outsiderDeleted } = await outsider.client
      .from("payee_default_tags")
      .delete()
      .eq("payee_id", sharedPayeeId)
      .select("tag_id");
    expect(outsiderDeleted ?? []).toEqual([]);
    const { error: reinsertError } = await owner.client
      .from("payee_default_tags")
      .insert({ payee_id: sharedPayeeId, tag_id: tag!.id });
    expect(reinsertError).toBeNull();

    // 他グループからは設定できない
    const { error: outsiderError } = await outsider.client
      .from("payee_default_tags")
      .insert({ payee_id: sharedPayeeId, tag_id: otherTag!.id });
    expect(outsiderError).not.toBeNull();

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

    // 自分用の既定値のタグも付けておく
    await member.client
      .from("payee_member_defaults")
      .upsert({ payee_id: sharedPayeeId, user_id: member.id }, { onConflict: "payee_id,user_id" });
    const { error: ownTagError } = await member.client
      .from("payee_member_default_tags")
      .insert({ payee_id: sharedPayeeId, user_id: member.id, tag_id: tag!.id });
    expect(ownTagError).toBeNull();

    // タグを削除すると、共通・自分用の既定値からも外れる（明細で使われていないタグ）
    const { error: deleteError } = await member.client.from("tags").delete().eq("id", tag!.id);
    expect(deleteError).toBeNull();
    const [{ data: remaining }, { data: ownRemaining }] = await Promise.all([
      admin.from("payee_default_tags").select("payee_id").eq("tag_id", tag!.id),
      admin.from("payee_member_default_tags").select("payee_id").eq("tag_id", tag!.id),
    ]);
    expect(remaining).toEqual([]);
    expect(ownRemaining).toEqual([]);
    await admin.from("payee_member_defaults").delete().eq("payee_id", sharedPayeeId);
  });

  it("I-55: 自分用の既定値は自分の分だけ作成・変更・削除でき、相方は読めるが変えられず、他グループからは読み書きできない", async () => {
    // 本人（一般メンバー）は、管理者が登録した支払い先に自分用の既定値を作れる
    const { error: createError } = await member.client.from("payee_member_defaults").insert({
      payee_id: sharedPayeeId,
      user_id: member.id,
      default_category_id: utilityId,
      default_breakdown_id: gasBreakdownId,
      default_owner_user_id: member.id,
    });
    expect(createError).toBeNull();

    // 相方は読める
    const { data: ownerRead } = await owner.client
      .from("payee_member_defaults")
      .select("user_id, default_owner_user_id")
      .eq("payee_id", sharedPayeeId);
    expect(ownerRead).toEqual([{ user_id: member.id, default_owner_user_id: member.id }]);

    // 相方は、本人の分を変更・削除できず、本人の分として作ることもできない
    const { data: ownerUpdated } = await owner.client
      .from("payee_member_defaults")
      .update({ default_owner_joint: true, default_owner_user_id: null })
      .eq("payee_id", sharedPayeeId)
      .eq("user_id", member.id)
      .select("user_id");
    expect(ownerUpdated ?? []).toEqual([]);
    const { data: ownerDeleted } = await owner.client
      .from("payee_member_defaults")
      .delete()
      .eq("payee_id", sharedPayeeId)
      .eq("user_id", member.id)
      .select("user_id");
    expect(ownerDeleted ?? []).toEqual([]);
    const { error: impersonateError } = await owner.client
      .from("payee_member_default_tags")
      .insert({ payee_id: sharedPayeeId, user_id: member.id, tag_id: 1 });
    expect(impersonateError).not.toBeNull();

    // 他グループからは読めず、他グループの支払い先に自分用を作ることもできない
    const { data: outsiderRead } = await outsider.client
      .from("payee_member_defaults")
      .select("user_id")
      .eq("payee_id", sharedPayeeId);
    expect(outsiderRead).toEqual([]);
    const { error: outsiderError } = await outsider.client
      .from("payee_member_defaults")
      .insert({ payee_id: sharedPayeeId, user_id: outsider.id });
    expect(outsiderError).not.toBeNull();
    // service role でも、グループのメンバーでない人の自分用は作れない（DBのトリガー）
    const { error: notMemberError } = await admin
      .from("payee_member_defaults")
      .insert({ payee_id: sharedPayeeId, user_id: outsider.id });
    expect(notMemberError).not.toBeNull();

    // 既定値の整合性は共通の既定値と同じく確かめる
    for (const values of [
      { default_category_id: foodId, default_breakdown_id: gasBreakdownId },
      { default_category_id: null, default_breakdown_id: gasBreakdownId },
      { default_counterpart_id: otherFutariId },
      { default_owner_user_id: outsider.id },
      { default_owner_joint: true, default_owner_user_id: member.id },
    ]) {
      const { error } = await member.client
        .from("payee_member_defaults")
        .update(values)
        .eq("payee_id", sharedPayeeId)
        .eq("user_id", member.id);
      expect(error, JSON.stringify(values)).not.toBeNull();
    }

    // 本人は変更・削除（共通に戻す）できる（商品名の既定値も自分用に持てる）
    const { data: updated } = await member.client
      .from("payee_member_defaults")
      .update({ default_counterpart_id: futariId, default_item_name: "Bのガス代" })
      .eq("payee_id", sharedPayeeId)
      .eq("user_id", member.id)
      .select("default_counterpart_id, default_item_name");
    expect(updated).toEqual([{ default_counterpart_id: futariId, default_item_name: "Bのガス代" }]);
    const { data: reset } = await member.client
      .from("payee_member_defaults")
      .delete()
      .eq("payee_id", sharedPayeeId)
      .eq("user_id", member.id)
      .select("user_id");
    expect(reset).toHaveLength(1);
  });

  it("I-56: メンバーがグループから外れると、その人の自分用の既定値が削除される", async () => {
    // グループは2人までのため、メンバーが1人の他グループに加わって確かめる
    const leaver = await createSignedInTestUser(admin, "payee-leaver");
    try {
      const { error: inviteError } = await outsider.client.from("group_members").insert({
        group_id: otherGroupId,
        invited_email: leaver.email.toLowerCase(),
        role: "member",
      });
      expect(inviteError).toBeNull();
      const { error: linkError } = await leaver.client.rpc("link_pending_group_memberships");
      expect(linkError).toBeNull();

      const { data: payee, error: payeeError } = await outsider.client
        .from("payees")
        .insert({ group_id: otherGroupId, name: "脱退テスト" })
        .select("id")
        .single();
      expect(payeeError).toBeNull();
      const { error: createError } = await leaver.client
        .from("payee_member_defaults")
        .insert({ payee_id: payee!.id, user_id: leaver.id, default_owner_joint: true });
      expect(createError).toBeNull();

      const { error: leaveError } = await admin
        .from("group_members")
        .delete()
        .eq("group_id", otherGroupId)
        .eq("user_id", leaver.id);
      expect(leaveError).toBeNull();

      const { data } = await admin
        .from("payee_member_defaults")
        .select("user_id")
        .eq("payee_id", payee!.id);
      expect(data).toEqual([]);
    } finally {
      await deleteTestUser(admin, leaver.id);
    }
  });
  it("I-63: 相手・帰属先＝登録する人をフラグで保存でき、相手の id・共同・メンバーとは同時に持てない（Issue #44）", async () => {
    // フラグを指定しなければ false（既存の支払い先も同じ）
    const { data: plain, error: plainError } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "登録する人テスト（初期値）" })
      .select("default_counterpart_registrant, default_owner_registrant")
      .single();
    expect(plainError).toBeNull();
    expect(plain).toEqual({ default_counterpart_registrant: false, default_owner_registrant: false });

    // 相手・帰属先＝登録する人で登録し、画面と同じ取得・変換で「登録する人」として読める
    const { data: created, error: createError } = await owner.client
      .from("payees")
      .insert({
        group_id: groupId,
        name: "登録する人テスト",
        default_category_id: foodId,
        default_counterpart_registrant: true,
        default_owner_registrant: true,
      })
      .select(PAYEE_SELECT)
      .single();
    expect(createError).toBeNull();
    expect(toPayee(created as unknown as PayeeRow).defaults).toMatchObject({
      categoryId: String(foodId),
      counterpartId: REGISTRANT_VALUE,
      ownerUserId: REGISTRANT_VALUE,
    });

    // 一般メンバーも共通の既定値として変更できる（登録する人 → 共同）
    const { error: memberUpdateError } = await member.client
      .from("payees")
      .update({ default_owner_registrant: false, default_owner_joint: true })
      .eq("id", (created as { id: number }).id);
    expect(memberUpdateError).toBeNull();

    const insertWith = (name: string, values: Record<string, unknown>) =>
      owner.client.from("payees").insert({ group_id: groupId, name, ...values });
    // 登録する人と、相手の id・共同・メンバーの同時指定は制約で拒否される
    const { error: counterpartBoth } = await insertWith("登録する人不正1", {
      default_counterpart_registrant: true,
      default_counterpart_id: futariId,
    });
    expect(counterpartBoth?.code).toBe("23514");
    const { error: jointBoth } = await insertWith("登録する人不正2", {
      default_owner_registrant: true,
      default_owner_joint: true,
    });
    expect(jointBoth?.code).toBe("23514");
    const { error: memberBoth } = await insertWith("登録する人不正3", {
      default_owner_registrant: true,
      default_owner_user_id: member.id,
    });
    expect(memberBoth?.code).toBe("23514");
  });
});
