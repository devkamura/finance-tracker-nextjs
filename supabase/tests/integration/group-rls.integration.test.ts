import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// RLSポリシーとSECURITY DEFINER関数の実際の振る舞いを、
// service_roleで用意した複数ユーザー・複数グループを使って検証する。
describe("グループベース管理画面機能のRLS/RPC", () => {
  const admin = createServiceRoleClient();

  let adminA: TestUser;
  let adminB: TestUser;
  let memberA1: TestUser;
  let groupAId: string;
  let groupBId: string;

  beforeAll(async () => {
    adminA = await createSignedInTestUser(admin, "admin-a");
    adminB = await createSignedInTestUser(admin, "admin-b");
    memberA1 = await createSignedInTestUser(admin, "member-a1");

    const { data: groupA, error: groupAError } = await adminA.client.rpc(
      "create_group_with_admin",
      { p_name: "グループA" }
    );
    if (groupAError) throw groupAError;
    groupAId = groupA.id;

    const { data: groupB, error: groupBError } = await adminB.client.rpc(
      "create_group_with_admin",
      { p_name: "グループB" }
    );
    if (groupBError) throw groupBError;
    groupBId = groupB.id;

    // memberA1を事前登録し、既存ユーザーが後日招待されたケースを模して
    // link_pending_group_membershipsで紐付ける（I-08/I-09相当）。
    const { error: inviteError } = await adminA.client
      .from("group_members")
      .insert({
        group_id: groupAId,
        invited_email: memberA1.email.toLowerCase(),
        role: "member",
      });
    if (inviteError) throw inviteError;

    const { error: linkError } = await memberA1.client.rpc(
      "link_pending_group_memberships"
    );
    if (linkError) throw linkError;
  });

  afterAll(async () => {
    await deleteTestUser(admin, adminA.id);
    await deleteTestUser(admin, adminB.id);
    await deleteTestUser(admin, memberA1.id);
  });

  it("I-01: 未所属ユーザーがグループを作成すると管理者として登録される", async () => {
    const { data: membership, error } = await adminA.client
      .from("group_members")
      .select("role")
      .eq("group_id", groupAId)
      .eq("user_id", adminA.id)
      .single();
    expect(error).toBeNull();
    expect(membership?.role).toBe("admin");
  });

  it("I-02: 既にグループに所属するユーザーは再度グループを作成できない", async () => {
    const { error } = await adminA.client.rpc("create_group_with_admin", {
      p_name: "二個目のグループ",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("already belongs to a group");
  });

  it("I-03: 同一ユーザーによる同時グループ作成は一方のみ成功する", async () => {
    const concurrentUser = await createSignedInTestUser(admin, "concurrent");
    try {
      const results = await Promise.allSettled([
        concurrentUser.client.rpc("create_group_with_admin", {
          p_name: "並行作成A",
        }),
        concurrentUser.client.rpc("create_group_with_admin", {
          p_name: "並行作成B",
        }),
      ]);

      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && !r.value.error
      );
      expect(succeeded.length).toBe(1);

      const { data: adminRows } = await admin
        .from("group_members")
        .select("id")
        .eq("user_id", concurrentUser.id)
        .eq("role", "admin");
      expect(adminRows?.length).toBe(1);
    } finally {
      await deleteTestUser(admin, concurrentUser.id);
    }
  });

  it("I-04: グループBのセッションからグループAの店舗は見えない", async () => {
    const { data: storeA, error: insertError } = await adminA.client
      .from("stores")
      .insert({ group_id: groupAId, name: "グループA専用店舗" })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { data: visibleFromB } = await adminB.client
      .from("stores")
      .select("id")
      .eq("id", storeA!.id);
    expect(visibleFromB).toEqual([]);
  });

  it("I-05: 一般メンバーは店舗をINSERTできない", async () => {
    const { error } = await memberA1.client.from("stores").insert({
      group_id: groupAId,
      name: "一般メンバーが登録しようとした店舗",
    });
    expect(error).not.toBeNull();
  });

  it("I-06: 管理者は他グループのgroup_idを指定して店舗を書き込めない", async () => {
    const { data } = await adminA.client
      .from("stores")
      .insert({ group_id: groupBId, name: "越境登録の店舗" })
      .select("id");
    expect(data === null || data.length === 0).toBe(true);
  });

  it("I-07: 同一グループへの重複招待は拒否される", async () => {
    const duplicateEmail = "duplicate-invite@example.com";
    const { error: firstError } = await adminA.client
      .from("group_members")
      .insert({
        group_id: groupAId,
        invited_email: duplicateEmail,
        role: "member",
      });
    expect(firstError).toBeNull();

    const { error: secondError } = await adminA.client
      .from("group_members")
      .insert({
        group_id: groupAId,
        invited_email: duplicateEmail,
        role: "member",
      });
    expect(secondError).not.toBeNull();
    expect(secondError?.code).toBe("23505");
  });

  it("I-08/I-09: 招待済みメールが初回ログイン相当の処理で紐付く", async () => {
    const { data: membership } = await adminA.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupAId)
      .eq("invited_email", memberA1.email.toLowerCase())
      .maybeSingle();
    expect(membership?.user_id).toBe(memberA1.id);
  });

  it("I-10: 管理者は自グループメンバーの表示名を更新できる", async () => {
    const { data: updated, error } = await adminA.client
      .from("profiles")
      .update({ display_name: "メンバーA1" })
      .eq("id", memberA1.id)
      .select("display_name")
      .maybeSingle();
    expect(error).toBeNull();
    expect(updated?.display_name).toBe("メンバーA1");
  });

  it("I-11: 管理者は他グループのユーザーの表示名を更新できない", async () => {
    const { data } = await adminA.client
      .from("profiles")
      .update({ display_name: "越境更新" })
      .eq("id", adminB.id)
      .select("display_name");
    expect(data).toEqual([]);
  });

  it("I-12: 一般ユーザーは自分の表示名を編集できない", async () => {
    const { data } = await memberA1.client
      .from("profiles")
      .update({ display_name: "自己編集" })
      .eq("id", memberA1.id)
      .select("display_name");
    expect(data).toEqual([]);
  });

  it("I-13: 管理者は招待中(未参加)のメンバーをグループから削除できる", async () => {
    const { data: invited, error: inviteError } = await adminA.client
      .from("group_members")
      .insert({
        group_id: groupAId,
        invited_email: "to-be-removed@example.com",
        role: "member",
      })
      .select("id")
      .single();
    expect(inviteError).toBeNull();

    const { error: deleteError } = await adminA.client
      .from("group_members")
      .delete()
      .eq("id", invited!.id);
    expect(deleteError).toBeNull();

    const { data: afterDelete } = await admin
      .from("group_members")
      .select("id")
      .eq("id", invited!.id);
    expect(afterDelete).toEqual([]);
  });

  it("I-14: 管理者は自分自身(admin行)をグループから削除できない", async () => {
    const { data: adminRow } = await adminA.client
      .from("group_members")
      .select("id")
      .eq("group_id", groupAId)
      .eq("user_id", adminA.id)
      .single();

    const { data: deleted } = await adminA.client
      .from("group_members")
      .delete()
      .eq("id", adminRow!.id)
      .select("id");
    expect(deleted).toEqual([]);

    const { data: stillExists } = await admin
      .from("group_members")
      .select("id")
      .eq("id", adminRow!.id);
    expect(stillExists?.length).toBe(1);
  });

  it("I-15: 一般ユーザーは他のメンバーをグループから削除できない", async () => {
    const { data: targetRow } = await admin
      .from("group_members")
      .select("id")
      .eq("group_id", groupAId)
      .eq("invited_email", "duplicate-invite@example.com")
      .single();

    const { data: deleted } = await memberA1.client
      .from("group_members")
      .delete()
      .eq("id", targetRow!.id)
      .select("id");
    expect(deleted).toEqual([]);
  });

  it("I-16: 他グループの管理者はメンバーを削除できない", async () => {
    const { data: memberA1Row } = await admin
      .from("group_members")
      .select("id")
      .eq("group_id", groupAId)
      .eq("user_id", memberA1.id)
      .single();

    const { data: deleted } = await adminB.client
      .from("group_members")
      .delete()
      .eq("id", memberA1Row!.id)
      .select("id");
    expect(deleted).toEqual([]);
  });

  it("I-17: 管理者は自グループの参加済み一般メンバーを削除できる", async () => {
    const { data: memberA1Row } = await admin
      .from("group_members")
      .select("id")
      .eq("group_id", groupAId)
      .eq("user_id", memberA1.id)
      .single();

    const { error } = await adminA.client
      .from("group_members")
      .delete()
      .eq("id", memberA1Row!.id);
    expect(error).toBeNull();

    const { data: afterDelete } = await admin
      .from("group_members")
      .select("id")
      .eq("id", memberA1Row!.id);
    expect(afterDelete).toEqual([]);
  });
});
