import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { specialExpenseTotal } from "@/lib/analytics/aggregate";
import { costTypeMap } from "@/lib/analytics/dimensions";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { buildSpecialExpenseListView } from "@/lib/analytics/special-expense-list";
import { listSpecialExpenseReceipts } from "@/lib/receipts/queries";

import {
  createServiceRoleClient,
  createSignedInTestUser,
  deleteTestUser,
  type TestUser,
} from "./test-helpers";

// ローカルSupabaseスタック（`supabase start`）への実接続が必要な結合テスト（I-60）。
// 明細の特別費フラグ（Issue #41）の列の初期値・保存・分析データへの反映と、
// 確定済みの月ではフラグも変えられないこと（今の制限のまま）を確かめる。
describe("特別費フラグ（DB）", () => {
  const admin = createServiceRoleClient();
  // 2026-11-25時点で分析する（対象は2025-12〜2026-11の12ヶ月）
  const NOW = new Date("2026-11-25T12:00:00+09:00");

  let userA: TestUser;
  let groupId: string;
  let foodId: number;
  let expenseTypeId: number;
  let counterpartId: number;

  // メンバー本人のクライアント（RLS あり）でレシートと明細を登録する
  async function insertReceipt(
    occurredAt: string,
    details: { price: number; is_special_expense?: boolean }[]
  ): Promise<{ receiptId: string; detailIds: string[] }> {
    const receiptId = crypto.randomUUID();
    const { error: receiptError } = await userA.client.from("receipts").insert({
      id: receiptId,
      group_id: groupId,
      payee_name: "特別費テスト",
      transaction_type_id: expenseTypeId,
      occurred_at: occurredAt,
      payer_user_id: userA.id,
      created_by: userA.id,
      amount: details.reduce((sum, d) => sum + d.price, 0),
    });
    if (receiptError) throw receiptError;

    // 複数行をまとめて登録すると、PostgREST は一部の行にない列を null として送り DB の初期値が
    // 使われないため、1行ずつ登録する
    const detailIds: string[] = [];
    for (const d of details) {
      const { data, error } = await userA.client
        .from("receipt_details")
        .insert({
          receipt_id: receiptId,
          item_name: "テスト商品",
          price: d.price,
          tax_type: "inclusive",
          category_id: foodId,
          counterpart_id: counterpartId,
          owner_user_id: null,
          // 指定がないときは列を送らない（DB の初期値を確かめるため）
          ...(d.is_special_expense === undefined ? {} : { is_special_expense: d.is_special_expense }),
        })
        .select("id")
        .single();
      if (error) throw error;
      detailIds.push(data.id);
    }
    return { receiptId, detailIds };
  }

  beforeAll(async () => {
    userA = await createSignedInTestUser(admin, "special-expense-a");

    const { data: group, error: groupError } = await userA.client.rpc(
      "create_group_with_admin",
      { p_name: "特別費テストグループ" }
    );
    if (groupError) throw groupError;
    groupId = group.id;

    const [{ data: food }, { data: types }, { data: counterpart }] = await Promise.all([
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
    counterpartId = counterpart!.id;
  }, 60000);

  afterAll(async () => {
    await admin.from("settlement_periods").delete().eq("group_id", groupId);
    await admin.from("receipts").delete().eq("group_id", groupId);
    await deleteTestUser(admin, userA.id);
  });

  it("I-60: 列を指定しない明細は通常（false）、指定した明細は特別費として保存される", async () => {
    const { detailIds } = await insertReceipt("2026-11-10T12:00:00+09:00", [
      { price: 1000 },
      { price: 30000, is_special_expense: true },
    ]);

    const { data, error } = await userA.client
      .from("receipt_details")
      .select("id, is_special_expense")
      .in("id", detailIds);
    expect(error).toBeNull();
    const byId = new Map(data!.map((d) => [d.id, d.is_special_expense]));
    expect(byId.get(detailIds[0])).toBe(false);
    expect(byId.get(detailIds[1])).toBe(true);
  });

  it("I-60: 分析データでは通常と特別費が別の行になり、isSpecialExpense が入る", async () => {
    const data = await getAnalyticsData(userA.client, groupId, NOW);
    const november = data.rows.filter((r) => r.month === "2026-11");
    expect(november).toHaveLength(2);
    expect(november.find((r) => !r.isSpecialExpense)?.amount).toBe(1000);
    expect(november.find((r) => r.isSpecialExpense)?.amount).toBe(30000);
  });

  it("I-60: 精算が確定した月の明細は、特別費フラグも変えられない（RLS）", async () => {
    const { detailIds } = await insertReceipt("2026-10-15T12:00:00+09:00", [{ price: 500 }]);

    // 10月を確定済みにする（確定処理そのものは receipts-settlement の結合テストで確認済み）
    const { error: confirmError } = await admin.from("settlement_periods").insert({
      group_id: groupId,
      period_month: "2026-10-01",
      user_a_id: userA.id,
      user_b_id: userA.id,
      user_a_burden: 500,
      user_b_burden: 0,
      user_a_paid: 500,
      user_b_paid: 0,
      settlement_amount: 0,
      settlement_from_user_id: userA.id,
      settlement_to_user_id: userA.id,
      confirmed_by: userA.id,
    });
    if (confirmError) throw confirmError;

    // RLS で対象外になった行は更新されない（エラーにはならず0件）
    await userA.client
      .from("receipt_details")
      .update({ is_special_expense: true })
      .eq("id", detailIds[0]);
    const { data } = await admin
      .from("receipt_details")
      .select("is_special_expense")
      .eq("id", detailIds[0])
      .single();
    expect(data!.is_special_expense).toBe(false);
  });

  it("I-62: 特別費の一覧は、特別費の明細を含むレシートだけを（通常の明細も含めて）読み、合計が分析画面と一致する", async () => {
    // 通常だけのレシート（一覧に出ない）と、期間外の特別費（出ない）
    const { receiptId: normalOnly } = await insertReceipt("2026-11-12T12:00:00+09:00", [{ price: 700 }]);
    const { receiptId: outOfRange } = await insertReceipt("2025-11-20T12:00:00+09:00", [
      { price: 9999, is_special_expense: true },
    ]);

    const data = await getAnalyticsData(userA.client, groupId, NOW);
    const { from, to } = {
      from: new Date("2025-12-01T00:00:00+09:00"),
      to: new Date("2026-12-01T00:00:00+09:00"),
    };
    const receipts = await listSpecialExpenseReceipts(userA.client, groupId, { from, to });
    const ids = receipts.map((r) => r.id);

    expect(ids).not.toContain(normalOnly);
    expect(ids).not.toContain(outOfRange);
    // 1件目のテスト（I-60）で入れた、通常 1,000・特別費 30,000 のレシートは、通常の明細も含めて読む
    const mixed = receipts.find((r) => r.items.some((i) => i.isSpecialExpense && i.price === 30000));
    expect(mixed?.items.map((i) => i.isSpecialExpense).sort()).toEqual([false, true]);

    const view = buildSpecialExpenseListView(receipts, { kind: "all" });
    expect(view.total).toBe(specialExpenseTotal(data.rows, { kind: "all" }, data.months, costTypeMap([])));
    expect(view.total).toBe(30000);
  });
});
