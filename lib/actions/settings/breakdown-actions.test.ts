import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBreakdown } from "@/lib/actions/settings/create-breakdown";
import { deleteBreakdown } from "@/lib/actions/settings/delete-breakdown";
import { updateBreakdown } from "@/lib/actions/settings/update-breakdown";
import { updateCategoryCostType } from "@/lib/actions/settings/update-category-cost-type";
import { requireGroupAdmin } from "@/lib/settings/admin";

vi.mock("@/lib/settings/admin", () => ({ requireGroupAdmin: vi.fn() }));

const mockedRequireGroupAdmin = vi.mocked(requireGroupAdmin);

// Supabaseのクエリビルダーを最小限に再現する。最後の呼び出し（single/maybeSingle/upsert）の結果を返す。
function fakeSupabase(results: {
  last?: { data: unknown };
  write?: { data: unknown; error: unknown };
}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "insert", "update", "delete"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  let maybeSingleCount = 0;
  chain.maybeSingle = () => {
    maybeSingleCount += 1;
    // createBreakdown は「末尾の並び順の取得」→「追加」の順で呼ぶため、最初の maybeSingle は last を返す
    const isLookup = calls.some((c) => c.method === "limit") && maybeSingleCount === 1;
    return Promise.resolve(isLookup ? { data: results.last?.data ?? null, error: null } : results.write);
  };
  chain.single = () => Promise.resolve(results.write);
  chain.upsert = (...args: unknown[]) => {
    calls.push({ method: "upsert", args });
    return Promise.resolve(results.write ?? { data: null, error: null });
  };
  const client = { from: vi.fn(() => chain) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

function asAdmin(client: unknown) {
  mockedRequireGroupAdmin.mockResolvedValue({
    ok: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: { supabase: client as any, groupId: "group-1" },
  });
}

const row = { id: 10, category_id: 1, name: "外食", is_hidden: false };

describe("内訳・費用区分の設定（Server Action）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("U-94: 管理者以外は内訳を追加・変更・削除できず、費用区分も変更できない", async () => {
    mockedRequireGroupAdmin.mockResolvedValue({ ok: false, error: "管理者のみ編集できます。" });
    const expected = { success: false, error: "管理者のみ編集できます。" };
    expect(await createBreakdown(1, "外食")).toEqual(expected);
    expect(await updateBreakdown(10, { name: "外食2" })).toEqual(expected);
    expect(await deleteBreakdown(10)).toEqual(expected);
    expect(await updateCategoryCostType(1, "fixed")).toEqual(expected);
  });

  it("U-94: 内訳名が空なら追加・名前の変更をしない", async () => {
    expect(await createBreakdown(1, "  ")).toEqual({
      success: false,
      error: "内訳名を入力してください。",
    });
    expect(await updateBreakdown(10, { name: "" })).toEqual({
      success: false,
      error: "内訳名を入力してください。",
    });
    expect(mockedRequireGroupAdmin).not.toHaveBeenCalled();
  });

  it("U-94: 内訳を追加すると、そのカテゴリの末尾の並び順で登録される", async () => {
    const { client, calls } = fakeSupabase({
      last: { data: { sort_order: 2 } },
      write: { data: row, error: null },
    });
    asAdmin(client);

    const result = await createBreakdown(1, " 外食 ");

    expect(result).toEqual({
      success: true,
      breakdown: { id: 10, categoryId: 1, name: "外食", isHidden: false },
    });
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({
      group_id: "group-1",
      category_id: 1,
      name: "外食",
      sort_order: 3,
    });
  });

  it("U-94: 同じカテゴリに同じ名前の内訳があると「同じ名前の内訳が既に存在します。」", async () => {
    const { client } = fakeSupabase({ write: { data: null, error: { code: "23505" } } });
    asAdmin(client);
    expect(await createBreakdown(1, "外食")).toEqual({
      success: false,
      error: "同じ名前の内訳が既に存在します。",
    });
  });

  it("U-95: 明細で使われている内訳は削除できず、非表示を案内する", async () => {
    const { client } = fakeSupabase({ write: { data: null, error: { code: "23503" } } });
    asAdmin(client);
    expect(await deleteBreakdown(10)).toEqual({
      success: false,
      error: "この内訳は登録済みの明細で使われているため削除できません。非表示にしてください。",
    });
  });

  it("U-95: 内訳を非表示にできる", async () => {
    const { client, calls } = fakeSupabase({
      write: { data: { ...row, is_hidden: true }, error: null },
    });
    asAdmin(client);
    const result = await updateBreakdown(10, { isHidden: true });
    expect(result).toMatchObject({ success: true, breakdown: { isHidden: true } });
    expect(calls.find((c) => c.method === "update")?.args[0]).toEqual({ is_hidden: true });
  });

  it("U-96: 費用区分は固定費・変動費だけ保存でき、グループの設定として保存する", async () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateCategoryCostType(1, "other" as any)
    ).toEqual({ success: false, error: "不正な費用区分です。" });

    const { client, calls } = fakeSupabase({});
    asAdmin(client);
    expect(await updateCategoryCostType(1, "fixed")).toEqual({ success: true });
    expect(calls.find((c) => c.method === "upsert")?.args).toEqual([
      { group_id: "group-1", category_id: 1, cost_type: "fixed" },
      { onConflict: "group_id,category_id" },
    ]);
  });
});
