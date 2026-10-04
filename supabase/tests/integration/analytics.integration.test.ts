import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAnalyticsData } from "@/lib/analytics/queries";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト。
// 支出分析のデータ取得（ページング・RLS・期間）と、メンバーの色の制約を検証する
// （docs/支出分析機能/詳細設計書.md 4章・6.5節）。
describe("支出分析のデータ取得", () => {
  const admin = createServiceRoleClient();
  // 2026-10-03時点で分析する（対象は2025-11〜2026-10の12ヶ月）
  const NOW = new Date("2026-10-03T12:00:00+09:00");

  let userA: TestUser;
  let outsider: TestUser;
  let groupId: string;
  let otherGroupId: string;
  let foodId: number;
  let dailyId: number;
  let expenseTypeId: number;

  // service_roleでレシートと明細（1件ずつ）をまとめて登録する。
  async function insertReceipts(
    targetGroupId: string,
    payerId: string,
    items: { occurredAt: string; amount: number; categoryId: number }[]
  ) {
    const receipts = items.map((item) => ({
      id: crypto.randomUUID(),
      group_id: targetGroupId,
      payee_name: "分析テスト",
      transaction_type_id: expenseTypeId,
      occurred_at: item.occurredAt,
      payer_user_id: payerId,
      created_by: payerId,
      amount: item.amount,
    }));
    const { error: receiptError } = await admin.from("receipts").insert(receipts);
    if (receiptError) throw receiptError;

    // 相手はグループごとのため、登録先のグループの「ふたり」を使う
    const { data: counterpart, error: counterpartError } = await admin
      .from("counterparts")
      .select("id")
      .eq("group_id", targetGroupId)
      .eq("name", "ふたり")
      .single();
    if (counterpartError) throw counterpartError;

    const { error: detailError } = await admin.from("receipt_details").insert(
      receipts.map((r, i) => ({
        receipt_id: r.id,
        item_name: "テスト商品",
        price: r.amount,
        tax_type: "inclusive",
        category_id: items[i].categoryId,
        counterpart_id: counterpart.id,
        owner_user_id: null,
      }))
    );
    if (detailError) throw detailError;
  }

  beforeAll(async () => {
    userA = await createSignedInTestUser(admin, "analytics-a");
    outsider = await createSignedInTestUser(admin, "analytics-outsider");

    const { data: group, error: groupError } = await userA.client.rpc(
      "create_group_with_admin",
      { p_name: "分析テストグループ" }
    );
    if (groupError) throw groupError;
    groupId = group.id;

    const { data: otherGroup, error: otherGroupError } = await outsider.client.rpc(
      "create_group_with_admin",
      { p_name: "分析テスト他グループ" }
    );
    if (otherGroupError) throw otherGroupError;
    otherGroupId = otherGroup.id;

    const [{ data: food }, { data: daily }, { data: types }] =
      await Promise.all([
        admin.from("categories").select("id").eq("name", "食費").single(),
        admin.from("categories").select("id").eq("name", "日用品").single(),
        admin.from("transaction_types").select("id, name"),
      ]);
    foodId = food!.id;
    dailyId = daily!.id;
    expenseTypeId = types!.find((t) => t.name === "支出")!.id;

    // I-28用：取得上限（1,000件）を超える1,001件（2026年9月・食費・各100円）
    await insertReceipts(
      groupId,
      userA.id,
      Array.from({ length: 1001 }, (_, i) => ({
        occurredAt: `2026-09-10T${String(i % 24).padStart(2, "0")}:00:00+09:00`,
        amount: 100,
        categoryId: foodId,
      }))
    );

    // I-30用：期間の境界（日用品）
    await insertReceipts(groupId, userA.id, [
      { occurredAt: "2025-10-31T23:59:00+09:00", amount: 1, categoryId: dailyId }, // 対象外（12ヶ月より前）
      { occurredAt: "2025-11-01T00:00:00+09:00", amount: 10, categoryId: dailyId }, // 対象（最初の月）
      { occurredAt: "2026-10-31T23:59:00+09:00", amount: 100, categoryId: dailyId }, // 対象（当月）
      { occurredAt: "2026-11-01T00:00:00+09:00", amount: 1000, categoryId: dailyId }, // 対象外（翌月）
    ]);

    // I-29用：他グループのレシート
    await insertReceipts(otherGroupId, outsider.id, [
      { occurredAt: "2026-09-10T12:00:00+09:00", amount: 5000, categoryId: foodId },
    ]);
  }, 60000);

  afterAll(async () => {
    await admin.from("receipts").delete().in("group_id", [groupId, otherGroupId]);
    await deleteTestUser(admin, userA.id);
    await deleteTestUser(admin, outsider.id);
  });

  // insertReceipts で登録した明細の、内訳・相手・支払い先（分析拡充 F4）
  const detailKeys = {
    breakdownId: null,
    counterpartId: expect.any(Number),
    payeeName: "分析テスト",
  };

  it("I-28: 取得上限（1,000件）を超える1,001件のレシートがすべて集計される", async () => {
    const data = await getAnalyticsData(userA.client, groupId, NOW);
    const food = data.rows.filter((r) => r.month === "2026-09" && r.categoryId === foodId);
    expect(food).toEqual([
      { ...detailKeys, month: "2026-09", categoryId: foodId, ownerUserId: null, amount: 100100 },
    ]);
  });

  it("I-29: 他グループのレシートは含まれない（RLS）", async () => {
    // 自グループの集計に他グループの5,000円が混ざらない
    const data = await getAnalyticsData(userA.client, groupId, NOW);
    const total = data.rows.reduce((sum, r) => sum + r.amount, 0);
    expect(total).toBe(100100 + 10 + 100);

    // 他グループのIDを指定しても、RLSにより1件も取得できない
    const crossGroup = await getAnalyticsData(userA.client, otherGroupId, NOW);
    expect(crossGroup.rows).toEqual([]);
  });

  it("I-30: 12ヶ月より前・翌月以降のレシートは含まれず、境界の月は含まれる", async () => {
    const data = await getAnalyticsData(userA.client, groupId, NOW);
    const daily = data.rows
      .filter((r) => r.categoryId === dailyId)
      .sort((a, b) => a.month.localeCompare(b.month));
    expect(daily).toEqual([
      { ...detailKeys, month: "2025-11", categoryId: dailyId, ownerUserId: null, amount: 10 },
      { ...detailKeys, month: "2026-10", categoryId: dailyId, ownerUserId: null, amount: 100 },
    ]);
    expect(data.months[0]).toBe("2025-11");
    expect(data.months[11]).toBe("2026-10");
  });

  it("I-31: メンバーの色はブルー・レッド・未設定だけを保存でき、それ以外はDBで拒否される", async () => {
    for (const color of ["blue", "red", null]) {
      const { error } = await admin.from("profiles").update({ color }).eq("id", userA.id);
      expect(error).toBeNull();
    }
    for (const color of ["green", "purple"]) {
      const { error } = await admin.from("profiles").update({ color }).eq("id", userA.id);
      expect(error).not.toBeNull();
    }
  });

  it("I-47: 内訳・相手・支払い先ごとに集約し、グループの費用区分・内訳・相手の名前を返す（分析拡充 F4）", async () => {
    // 他のテストの合計に影響しないよう、他グループ（outsiderが管理者）で確認する
    const { error: costError } = await outsider.client
      .from("category_settings")
      .upsert({ group_id: otherGroupId, category_id: foodId, cost_type: "fixed" });
    expect(costError).toBeNull();
    const { data: breakdown, error: breakdownError } = await outsider.client
      .from("category_breakdowns")
      .insert({ group_id: otherGroupId, category_id: foodId, name: "外食", sort_order: 1 })
      .select("id")
      .single();
    expect(breakdownError).toBeNull();
    const { data: counterparts } = await outsider.client
      .from("counterparts")
      .select("id, name")
      .eq("group_id", otherGroupId);
    const friend = counterparts!.find((c) => c.name === "友人")!;

    const receiptId = crypto.randomUUID();
    const { error: receiptError } = await admin.from("receipts").insert({
      id: receiptId,
      group_id: otherGroupId,
      payee_name: "居酒屋",
      transaction_type_id: expenseTypeId,
      occurred_at: "2026-08-20T19:00:00+09:00",
      payer_user_id: outsider.id,
      created_by: outsider.id,
      amount: 3000,
    });
    expect(receiptError).toBeNull();
    const { error: detailError } = await admin.from("receipt_details").insert({
      receipt_id: receiptId,
      item_name: "飲み会",
      price: 3000,
      tax_type: "inclusive",
      category_id: foodId,
      breakdown_id: breakdown!.id,
      counterpart_id: friend.id,
      owner_user_id: outsider.id,
    });
    expect(detailError).toBeNull();

    const data = await getAnalyticsData(outsider.client, otherGroupId, NOW);

    expect(data.rows.filter((r) => r.month === "2026-08")).toEqual([
      {
        month: "2026-08",
        categoryId: foodId,
        breakdownId: breakdown!.id,
        counterpartId: friend.id,
        payeeName: "居酒屋",
        ownerUserId: outsider.id,
        amount: 3000,
      },
    ]);
    expect(data.categories.find((c) => c.id === foodId)?.costType).toBe("fixed");
    expect(data.breakdowns).toEqual([{ id: breakdown!.id, categoryId: foodId, name: "外食" }]);
    // 既定の相手とメンバー（表示名）の相手が入る
    expect(data.counterparts.map((c) => c.name)).toEqual(
      expect.arrayContaining(["ふたり", "友人", "実家"])
    );
    expect(data.counterparts.length).toBe(4);
    expect(data.payeeNames).toEqual(["分析テスト", "居酒屋"].sort((a, b) => a.localeCompare(b, "ja")));
  });
});
