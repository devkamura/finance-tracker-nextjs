import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// 分析拡充 F5：支払い先の別名の権限（RLS・add_payee_alias）・重複のルール・過去のレシートの切り替えを検証する
// （docs/分析拡充/要件定義書.md 4.7節、詳細設計書 F5）。
describe("支払い先の別名", () => {
  const admin = createServiceRoleClient();

  let owner: TestUser; // グループ管理者
  let member: TestUser; // 一般メンバー
  let outsider: TestUser; // 別グループの管理者
  let groupId: string;
  let otherGroupId: string;
  let foodId: number;
  let expenseTypeId: number;
  let futariId: number;
  let okId: number; // グループ全体「オーケー」
  let memberPayeeId: number; // 一般メンバーの自分用「〇〇薬局」

  // service_role でレシートを入れる（精算確定済みの月にも入れられるように RLS を通さない）
  const insertReceipt = async (values: {
    payeeName: string;
    payeeId?: number | null;
    occurredAt?: string;
    createdBy?: string;
    withDetail?: boolean;
  }) => {
    const id = crypto.randomUUID();
    const createdBy = values.createdBy ?? owner.id;
    const { error } = await admin.from("receipts").insert({
      id,
      group_id: groupId,
      payee_id: values.payeeId ?? null,
      payee_name: values.payeeName,
      transaction_type_id: expenseTypeId,
      occurred_at: values.occurredAt ?? "2026-09-10T03:00:00Z",
      payer_user_id: createdBy,
      created_by: createdBy,
      amount: 1000,
    });
    if (error) throw error;
    if (values.withDetail) {
      const { error: detailError } = await admin.from("receipt_details").insert({
        receipt_id: id,
        item_name: "牛乳",
        price: 1000,
        tax_type: "inclusive",
        category_id: foodId,
        counterpart_id: futariId,
        owner_user_id: createdBy,
      });
      if (detailError) throw detailError;
    }
    return id;
  };

  const receiptPayee = async (id: string) => {
    const { data } = await admin
      .from("receipts")
      .select("payee_id, payee_name")
      .eq("id", id)
      .single();
    return data;
  };

  beforeAll(async () => {
    owner = await createSignedInTestUser(admin, "alias-owner");
    member = await createSignedInTestUser(admin, "alias-member");
    outsider = await createSignedInTestUser(admin, "alias-outsider");

    const { data: group, error: groupError } = await owner.client.rpc("create_group_with_admin", {
      p_name: "別名テストグループ",
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
      { p_name: "別名テスト他グループ" }
    );
    if (otherGroupError) throw otherGroupError;
    otherGroupId = otherGroup.id;

    const [{ data: food }, { data: types }, { data: futari }] = await Promise.all([
      admin.from("categories").select("id").eq("name", "食費").single(),
      admin.from("transaction_types").select("id, name"),
      admin.from("counterparts").select("id").eq("group_id", groupId).eq("name", "ふたり").single(),
    ]);
    foodId = food!.id;
    expenseTypeId = types!.find((t) => t.name === "支出")!.id;
    futariId = futari!.id;

    const { data: ok, error: okError } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "オーケー" })
      .select("id")
      .single();
    if (okError) throw okError;
    okId = ok.id;

    const { data: own, error: ownError } = await member.client
      .from("payees")
      .insert({ group_id: groupId, owner_user_id: member.id, name: "〇〇薬局" })
      .select("id")
      .single();
    if (ownError) throw ownError;
    memberPayeeId = own.id;
  });

  afterAll(async () => {
    // 支払い先はレシートから参照されるため、先にレシートを消す
    await admin.from("receipts").delete().in("group_id", [groupId, otherGroupId]);
    await admin.from("settlement_periods").delete().in("group_id", [groupId, otherGroupId]);
    await admin.from("payees").delete().in("group_id", [groupId, otherGroupId]);
    await deleteTestUser(admin, owner.id);
    await deleteTestUser(admin, member.id);
    await deleteTestUser(admin, outsider.id);
  });

  it("I-48: 別名は支払い先と同じ権限で追加・削除でき、直接の追加はできず、他グループからは読めない", async () => {
    // グループ全体の支払い先：管理者は追加できる。一般メンバー・他グループは追加できない
    const { data: added, error: addError } = await owner.client.rpc("add_payee_alias", {
      p_payee_id: okId,
      p_name: "OK STORE",
    });
    expect(addError).toBeNull();
    expect(added).toMatchObject({ name: "OK STORE", converted: 0 });
    const { error: memberSharedError } = await member.client.rpc("add_payee_alias", {
      p_payee_id: okId,
      p_name: "一般メンバーから",
    });
    expect(memberSharedError?.code).toBe("42501");
    const { error: outsiderError } = await outsider.client.rpc("add_payee_alias", {
      p_payee_id: okId,
      p_name: "他グループから",
    });
    expect(outsiderError?.code).toBe("P0002");

    // 自分用の支払い先：本人は追加でき、相方（管理者でも）は追加できない
    const { error: memberOwnError } = await member.client.rpc("add_payee_alias", {
      p_payee_id: memberPayeeId,
      p_name: "〇〇薬局 駅前店",
    });
    expect(memberOwnError).toBeNull();
    const { error: ownerOwnError } = await owner.client.rpc("add_payee_alias", {
      p_payee_id: memberPayeeId,
      p_name: "相方から",
    });
    expect(ownerOwnError?.code).toBe("42501");

    // 直接の追加は RLS で拒否される（過去のレシートの切り替えを飛ばさないよう、RPC からだけ追加する）
    const { error: directError } = await owner.client
      .from("payee_aliases")
      .insert({ payee_id: okId, group_id: groupId, name: "直接" });
    expect(directError).not.toBeNull();

    // グループのメンバーは読め、他グループは読めない
    const { data: memberRead } = await member.client
      .from("payee_aliases")
      .select("name")
      .eq("group_id", groupId);
    expect((memberRead ?? []).map((a) => a.name).sort()).toEqual(["OK STORE", "〇〇薬局 駅前店"]);
    const { data: outsiderRead } = await outsider.client
      .from("payee_aliases")
      .select("name")
      .eq("group_id", groupId);
    expect(outsiderRead).toEqual([]);

    // 削除：一般メンバーはグループ全体の別名を消せず、本人は自分用の別名を消せる
    const { data: memberDeleted } = await member.client
      .from("payee_aliases")
      .delete()
      .eq("name", "OK STORE")
      .select("id");
    expect(memberDeleted ?? []).toEqual([]);
    const { data: ownerDeletedOwn } = await owner.client
      .from("payee_aliases")
      .delete()
      .eq("name", "〇〇薬局 駅前店")
      .select("id");
    expect(ownerDeletedOwn ?? []).toEqual([]);
    const { data: memberDeletedOwn } = await member.client
      .from("payee_aliases")
      .delete()
      .eq("name", "〇〇薬局 駅前店")
      .select("id");
    expect(memberDeletedOwn).toHaveLength(1);
    const { data: ownerDeleted } = await owner.client
      .from("payee_aliases")
      .delete()
      .eq("name", "OK STORE")
      .select("id");
    expect(ownerDeleted).toHaveLength(1);
  });

  it("I-49: 別名はグループ内で重複できず、支払い先の名前と同じにはできない（前後の空白は除いて保存する）", async () => {
    const { data: trimmed, error: trimError } = await owner.client.rpc("add_payee_alias", {
      p_payee_id: okId,
      p_name: "　オーケー青葉台店 ",
    });
    expect(trimError).toBeNull();
    expect(trimmed).toMatchObject({ name: "オーケー青葉台店" });

    // 同じ別名は、別の支払い先（自分用）にも登録できない
    const { error: dupError } = await member.client.rpc("add_payee_alias", {
      p_payee_id: memberPayeeId,
      p_name: "オーケー青葉台店",
    });
    expect(dupError?.code).toBe("23505");

    // 登録済みの支払い先の名前（グループ全体・自分用）は別名にできない
    const { error: sameAsShared } = await member.client.rpc("add_payee_alias", {
      p_payee_id: memberPayeeId,
      p_name: "オーケー",
    });
    expect(sameAsShared?.code).toBe("23505");
    expect(sameAsShared?.message).toContain("conflicts with a payee name");
    const { error: sameAsOwn } = await owner.client.rpc("add_payee_alias", {
      p_payee_id: okId,
      p_name: "〇〇薬局",
    });
    expect(sameAsOwn?.code).toBe("23505");

    // 逆に、別名として登録済みの名前は、支払い先の名前にできない（追加・変更）
    const { error: createError } = await owner.client
      .from("payees")
      .insert({ group_id: groupId, name: "オーケー青葉台店" });
    expect(createError?.code).toBe("23505");
    expect(createError?.message).toContain("conflicts with an alias");
    const { error: renameError } = await member.client
      .from("payees")
      .update({ name: "オーケー青葉台店" })
      .eq("id", memberPayeeId);
    expect(renameError?.code).toBe("23505");

    // 空の別名は登録できない
    const { error: emptyError } = await owner.client.rpc("add_payee_alias", {
      p_payee_id: okId,
      p_name: "   ",
    });
    expect(emptyError).not.toBeNull();
  });

  it("I-50: 別名を追加すると、店名が一致する紐づいていないレシートを支払い先に切り替える（精算確定済みの月も・明細はそのまま）", async () => {
    const target = await insertReceipt({ payeeName: "オーケー長津田店", withDetail: true });
    const spaced = await insertReceipt({ payeeName: " オーケー長津田店　" });
    const partial = await insertReceipt({ payeeName: "オーケー長津田" });
    const otherLinked = await insertReceipt({ payeeName: "オーケー長津田店", payeeId: memberPayeeId });
    // 2026年8月の精算を確定してから、その月のレシートも切り替わることを確かめる
    const confirmedMonth = await insertReceipt({
      payeeName: "オーケー長津田店",
      occurredAt: "2026-08-15T03:00:00Z",
    });
    const { error: confirmError } = await owner.client.rpc("confirm_settlement", {
      p_group_id: groupId,
      p_period_month: "2026-08-01",
      p_user_a_id: owner.id,
      p_user_b_id: member.id,
      p_user_a_burden: 500,
      p_user_b_burden: 500,
      p_user_a_paid: 1000,
      p_user_b_paid: 0,
      p_settlement_amount: 500,
      p_settlement_from_user_id: member.id,
      p_settlement_to_user_id: owner.id,
    });
    expect(confirmError).toBeNull();

    const { data: detailBefore } = await admin
      .from("receipt_details")
      .select("category_id, breakdown_id, counterpart_id, owner_user_id")
      .eq("receipt_id", target)
      .single();

    const { data, error } = await owner.client.rpc("add_payee_alias", {
      p_payee_id: okId,
      p_name: "オーケー長津田店",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ name: "オーケー長津田店", converted: 3 });

    expect(await receiptPayee(target)).toEqual({ payee_id: okId, payee_name: "オーケー" });
    expect(await receiptPayee(spaced)).toEqual({ payee_id: okId, payee_name: "オーケー" });
    expect(await receiptPayee(confirmedMonth)).toEqual({ payee_id: okId, payee_name: "オーケー" });
    // 部分一致・既に別の支払い先に紐づいているレシートはそのまま
    expect(await receiptPayee(partial)).toEqual({ payee_id: null, payee_name: "オーケー長津田" });
    expect(await receiptPayee(otherLinked)).toEqual({
      payee_id: memberPayeeId,
      payee_name: "オーケー長津田店",
    });

    // 明細の値（カテゴリ・内訳・相手・帰属先）は変わらない
    const { data: detailAfter } = await admin
      .from("receipt_details")
      .select("category_id, breakdown_id, counterpart_id, owner_user_id")
      .eq("receipt_id", target)
      .single();
    expect(detailAfter).toEqual(detailBefore);

    // 別名を削除しても、切り替えたレシートは元に戻らない
    await owner.client.from("payee_aliases").delete().eq("name", "オーケー長津田店");
    expect(await receiptPayee(target)).toEqual({ payee_id: okId, payee_name: "オーケー" });
  });

  it("I-51: 自分用の支払い先の別名で切り替えるのは、本人が登録したレシートだけ", async () => {
    const mine = await insertReceipt({ payeeName: "〇〇ドラッグ", createdBy: member.id });
    const partners = await insertReceipt({ payeeName: "〇〇ドラッグ", createdBy: owner.id });

    const { data, error } = await member.client.rpc("add_payee_alias", {
      p_payee_id: memberPayeeId,
      p_name: "〇〇ドラッグ",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ converted: 1 });

    expect(await receiptPayee(mine)).toEqual({ payee_id: memberPayeeId, payee_name: "〇〇薬局" });
    expect(await receiptPayee(partners)).toEqual({ payee_id: null, payee_name: "〇〇ドラッグ" });
  });
});
