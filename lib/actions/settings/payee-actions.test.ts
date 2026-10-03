import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPayee, deletePayee, updatePayee } from "@/lib/actions/settings/payees";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { EMPTY_PAYEE_DEFAULTS } from "@/lib/receipts/payees";
import { requireGroupMembership } from "@/lib/settings/admin";

vi.mock("@/lib/settings/admin", () => ({ requireGroupMembership: vi.fn() }));
// 既定値の入力チェックに使うグループのデータ。カテゴリ 2＝水道光熱費（内訳 21＝ガス）、相手 3＝ふたり
vi.mock("@/lib/settings/queries", () => ({
  getCategoriesWithCostType: vi.fn().mockResolvedValue([
    { id: 1, name: "食費", costType: "variable" },
    { id: 2, name: "水道光熱費", costType: "fixed" },
  ]),
  getCategoryBreakdowns: vi
    .fn()
    .mockResolvedValue([{ id: 21, categoryId: 2, name: "ガス", isHidden: false }]),
  getCounterparts: vi
    .fn()
    .mockResolvedValue([{ id: 3, kind: "default", userId: null, name: "ふたり", isHidden: false }]),
}));
vi.mock("@/lib/supabase/group", () => ({
  getGroupMembers: vi.fn().mockResolvedValue([
    { userId: "user-a", role: "admin", displayName: "A", color: null },
    { userId: "user-b", role: "member", displayName: "B", color: null },
  ]),
}));

const mockedRequireGroupMembership = vi.mocked(requireGroupMembership);

const USER_A = "user-a";
const USER_B = "user-b";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: "myTOKYOGAS",
    owner_user_id: null,
    is_hidden: false,
    default_category_id: null,
    default_breakdown_id: null,
    default_counterpart_id: null,
    default_owner_joint: false,
    default_owner_user_id: null,
    ...overrides,
  };
}

// Supabaseのクエリビルダーを最小限に再現する。
// 最初の maybeSingle（insert/update/delete の前）は対象の支払い先の取得として existing を返し、
// 書き込みの後の maybeSingle・single は write を返す。
function fakeSupabase(results: {
  existing?: unknown;
  write?: { data: unknown; error: unknown };
}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert", "update", "delete"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  const isWrite = () => calls.some((c) => ["insert", "update", "delete"].includes(c.method));
  chain.maybeSingle = () =>
    Promise.resolve(isWrite() ? results.write : { data: results.existing ?? null, error: null });
  chain.single = () => Promise.resolve(results.write);
  const client = { from: vi.fn(() => chain) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

function signIn(client: unknown, userId: string, isAdmin: boolean) {
  mockedRequireGroupMembership.mockResolvedValue({
    ok: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: { supabase: client as any, groupId: "group-1", userId, isAdmin },
  });
}

function writtenValues(calls: { method: string; args: unknown[] }[], method: "insert" | "update") {
  return calls.find((c) => c.method === method)?.args[0] as Record<string, unknown> | undefined;
}

describe("支払い先の設定（Server Action）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("U-109: 名前が空なら追加・名前の変更をしない", async () => {
    const expected = { success: false, error: "支払い先名を入力してください。" };
    expect(await createPayee({ scope: "own", name: " " })).toEqual(expected);
    expect(await updatePayee(10, { name: "" })).toEqual(expected);
    expect(mockedRequireGroupMembership).not.toHaveBeenCalled();
  });

  it("U-109: グループ全体の支払い先は、管理者以外は追加・変更・削除できない", async () => {
    const { client, calls } = fakeSupabase({ existing: row({ owner_user_id: null }) });
    signIn(client, USER_B, false);
    const expected = { success: false, error: "グループ全体の支払い先は管理者のみ編集できます。" };

    expect(await createPayee({ scope: "shared", name: "スーパー" })).toEqual(expected);
    expect(await updatePayee(10, { isHidden: true })).toEqual(expected);
    expect(await deletePayee(10)).toEqual(expected);
    expect(calls.some((c) => ["insert", "update", "delete"].includes(c.method))).toBe(false);
  });

  it("U-109: 相方の自分用の支払い先は、管理者でも変更・削除できない", async () => {
    const { client, calls } = fakeSupabase({ existing: row({ owner_user_id: USER_B }) });
    signIn(client, USER_A, true);
    const expected = { success: false, error: "他のメンバーの支払い先は編集できません。" };

    expect(await updatePayee(10, { name: "変更" })).toEqual(expected);
    expect(await deletePayee(10)).toEqual(expected);
    expect(calls.some((c) => ["update", "delete"].includes(c.method))).toBe(false);
  });

  it("U-109: 一般メンバーも自分用の支払い先を既定値つきで追加できる（登録者＝本人）", async () => {
    const { client, calls } = fakeSupabase({
      write: {
        data: row({ name: "〇〇薬局", owner_user_id: USER_B, default_counterpart_id: 3, default_owner_user_id: USER_B }),
        error: null,
      },
    });
    signIn(client, USER_B, false);

    const result = await createPayee({
      scope: "own",
      name: " 〇〇薬局 ",
      defaults: { ...EMPTY_PAYEE_DEFAULTS, counterpartId: "3", ownerUserId: USER_B },
    });

    expect(result).toMatchObject({
      success: true,
      payee: { name: "〇〇薬局", ownerUserId: USER_B, defaults: { counterpartId: "3", ownerUserId: USER_B } },
    });
    expect(writtenValues(calls, "insert")).toEqual({
      group_id: "group-1",
      owner_user_id: USER_B,
      name: "〇〇薬局",
      default_category_id: null,
      default_breakdown_id: null,
      default_counterpart_id: 3,
      default_owner_joint: false,
      default_owner_user_id: USER_B,
    });
  });

  it("U-109: 管理者はグループ全体の支払い先を追加できる（登録者は空）", async () => {
    const { client, calls } = fakeSupabase({ write: { data: row(), error: null } });
    signIn(client, USER_A, true);

    const result = await createPayee({
      scope: "shared",
      name: "myTOKYOGAS",
      defaults: { categoryId: "2", breakdownId: "21", counterpartId: "3", ownerUserId: OWNER_JOINT_VALUE },
    });

    expect(result.success).toBe(true);
    expect(writtenValues(calls, "insert")).toMatchObject({
      owner_user_id: null,
      default_category_id: 2,
      default_breakdown_id: 21,
      default_counterpart_id: 3,
      default_owner_joint: true,
      default_owner_user_id: null,
    });
  });

  it("U-109: 同じ一覧に同じ名前があれば追加・変更できない（23505）", async () => {
    const expected = { success: false, error: "同じ名前の支払い先が既に存在します。" };
    const duplicate = () =>
      fakeSupabase({
        existing: row({ owner_user_id: USER_A }),
        write: { data: null, error: { code: "23505" } },
      }).client;

    signIn(duplicate(), USER_A, false);
    expect(await createPayee({ scope: "own", name: "スーパー" })).toEqual(expected);
    signIn(duplicate(), USER_A, false);
    expect(await updatePayee(10, { name: "スーパー" })).toEqual(expected);
  });

  it("U-109: 既定値が不正なら保存しない（別カテゴリの内訳・グループにない相手）", async () => {
    const { client, calls } = fakeSupabase({ existing: row({ owner_user_id: USER_A }) });
    signIn(client, USER_A, false);

    expect(
      await createPayee({
        scope: "own",
        name: "店",
        defaults: { ...EMPTY_PAYEE_DEFAULTS, categoryId: "1", breakdownId: "21" },
      })
    ).toEqual({ success: false, error: "内訳の既定値が不正です。" });
    expect(
      await updatePayee(10, { defaults: { ...EMPTY_PAYEE_DEFAULTS, counterpartId: "99" } })
    ).toEqual({ success: false, error: "相手の既定値が不正です。" });
    expect(calls.some((c) => ["insert", "update"].includes(c.method))).toBe(false);
  });

  it("U-109: 自分用の支払い先の名前・既定値を変更できる", async () => {
    const { client, calls } = fakeSupabase({
      existing: row({ owner_user_id: USER_A }),
      write: { data: row({ owner_user_id: USER_A, name: "新しい名前", default_category_id: 2 }), error: null },
    });
    signIn(client, USER_A, false);

    const result = await updatePayee(10, {
      name: " 新しい名前 ",
      defaults: { ...EMPTY_PAYEE_DEFAULTS, categoryId: "2" },
    });

    expect(result).toMatchObject({ success: true, payee: { name: "新しい名前" } });
    expect(writtenValues(calls, "update")).toMatchObject({
      name: "新しい名前",
      default_category_id: 2,
      default_breakdown_id: null,
    });
  });

  it("U-109: 非表示にできる", async () => {
    const { client, calls } = fakeSupabase({
      existing: row(),
      write: { data: row({ is_hidden: true }), error: null },
    });
    signIn(client, USER_A, true);

    const result = await updatePayee(10, { isHidden: true });

    expect(result).toMatchObject({ success: true, payee: { isHidden: true } });
    expect(writtenValues(calls, "update")).toEqual({ is_hidden: true });
  });

  it("U-109: 使われている支払い先は削除できず、非表示を案内する（23503）。使われていなければ削除できる", async () => {
    const used = fakeSupabase({ existing: row(), write: { data: null, error: { code: "23503" } } });
    signIn(used.client, USER_A, true);
    expect(await deletePayee(10)).toEqual({
      success: false,
      error: "この支払い先は登録済みのレシートで使われているため削除できません。非表示にしてください。",
    });

    const unused = fakeSupabase({ existing: row(), write: { data: { id: 10 }, error: null } });
    signIn(unused.client, USER_A, true);
    expect(await deletePayee(10)).toEqual({ success: true });
  });

  it("U-109: 他グループ・存在しない支払い先は変更・削除できない", async () => {
    const { client } = fakeSupabase({ existing: null });
    signIn(client, USER_A, true);
    const expected = { success: false, error: "支払い先が見つかりません。" };
    expect(await updatePayee(999, { isHidden: true })).toEqual(expected);
    expect(await deletePayee(999)).toEqual(expected);
  });
});
