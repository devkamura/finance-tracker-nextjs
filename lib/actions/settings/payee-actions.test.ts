import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addPayeeAlias,
  createPayee,
  deletePayee,
  deletePayeeAlias,
  resetOwnPayeeDefaults,
  setOwnPayeeDefaults,
  setPayeeHidden,
  updatePayee,
  updatePayeeCommonDefaults,
} from "@/lib/actions/settings/payees";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { EMPTY_PAYEE_DEFAULTS } from "@/lib/receipts/payees";
import { requireGroupMembership } from "@/lib/settings/admin";

vi.mock("@/lib/settings/admin", () => ({ requireGroupMembership: vi.fn() }));
// 既定値の入力チェックに使うグループのデータ。カテゴリ 2＝水道光熱費（内訳 21＝ガス）、相手 3＝ふたり、タグ 7＝夕食・8＝朝食
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
  getTags: vi.fn().mockResolvedValue([
    { id: 7, name: "夕食", isHidden: false },
    { id: 8, name: "朝食", isHidden: false },
  ]),
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
    default_category_id: null,
    default_breakdown_id: null,
    default_counterpart_id: null,
    default_owner_joint: false,
    default_owner_user_id: null,
    default_item_name: null,
    payee_default_tags: [],
    payee_aliases: [],
    payee_hidden_members: [],
    payee_member_defaults: [],
    ...overrides,
  };
}

// Supabaseのクエリビルダーを最小限に再現する。
// 最初の maybeSingle（insert/update/delete の前）は対象の支払い先の取得として existing を返し、
// 書き込みの後の maybeSingle・single は write を返す。
function fakeSupabase(results: {
  existing?: unknown;
  write?: { data: unknown; error: unknown };
  rpc?: { data: unknown; error: unknown };
}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert", "update", "delete", "upsert"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  const isWrite = () => calls.some((c) => ["insert", "update", "delete"].includes(c.method));
  chain.maybeSingle = () =>
    Promise.resolve(isWrite() ? results.write : { data: results.existing ?? null, error: null });
  chain.single = () => Promise.resolve(results.write);
  const client = { from: vi.fn(() => chain), rpc: vi.fn(() => Promise.resolve(results.rpc)) };
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
    expect(await createPayee({ name: " " })).toEqual(expected);
    expect(await updatePayee(10, { name: "" })).toEqual(expected);
    expect(mockedRequireGroupMembership).not.toHaveBeenCalled();
  });

  it("U-137: 管理者でないメンバーも、既定値つきで追加できる（登録者は持たない）", async () => {
    const { client, calls } = fakeSupabase({
      write: {
        data: row({ name: "〇〇薬局", default_counterpart_id: 3, default_owner_user_id: USER_B }),
        error: null,
      },
    });
    signIn(client, USER_B, false);

    const result = await createPayee({
      name: " 〇〇薬局 ",
      defaults: { ...EMPTY_PAYEE_DEFAULTS, counterpartId: "3", ownerUserId: USER_B },
    });

    expect(result).toMatchObject({
      success: true,
      // 追加した支払い先は全員に表示される
      payee: {
        name: "〇〇薬局",
        hiddenUserIds: [],
        defaults: { counterpartId: "3", ownerUserId: USER_B },
      },
    });
    expect(writtenValues(calls, "insert")).toEqual({
      group_id: "group-1",
      name: "〇〇薬局",
      default_category_id: null,
      default_breakdown_id: null,
      default_counterpart_id: 3,
      default_owner_joint: false,
      default_owner_user_id: USER_B,
      default_item_name: null,
    });
  });

  it("U-109: 既定値（カテゴリ・内訳・相手・帰属先）を列に変換して追加する", async () => {
    const { client, calls } = fakeSupabase({ write: { data: row(), error: null } });
    signIn(client, USER_A, true);

    const result = await createPayee({
      name: "myTOKYOGAS",
      defaults: {
        categoryId: "2",
        breakdownId: "21",
        counterpartId: "3",
        ownerUserId: OWNER_JOINT_VALUE,
        tagIds: [],
        itemName: " ガス代 ",
      },
    });

    expect(result.success).toBe(true);
    expect(writtenValues(calls, "insert")).toMatchObject({
      default_category_id: 2,
      default_breakdown_id: 21,
      default_counterpart_id: 3,
      default_owner_joint: true,
      default_owner_user_id: null,
      // 商品名は前後の空白を除いて保存する
      default_item_name: "ガス代",
    });
  });

  it("U-109: グループに同じ名前があれば追加・変更できない（23505）", async () => {
    const expected = { success: false, error: "同じ名前の支払い先が既に存在します。" };
    const duplicate = () =>
      fakeSupabase({ existing: row(), write: { data: null, error: { code: "23505" } } }).client;

    signIn(duplicate(), USER_A, false);
    expect(await createPayee({ name: "スーパー" })).toEqual(expected);
    signIn(duplicate(), USER_A, false);
    expect(await updatePayee(10, { name: "スーパー" })).toEqual(expected);
  });

  it("U-109: 既定値が不正なら保存しない（別カテゴリの内訳・グループにない相手）", async () => {
    const { client, calls } = fakeSupabase({ existing: row() });
    signIn(client, USER_A, false);

    expect(
      await createPayee({
        name: "店",
        defaults: { ...EMPTY_PAYEE_DEFAULTS, categoryId: "1", breakdownId: "21" },
      })
    ).toEqual({ success: false, error: "内訳の既定値が不正です。" });
    expect(
      await setOwnPayeeDefaults(10, { ...EMPTY_PAYEE_DEFAULTS, counterpartId: "99" })
    ).toEqual({ success: false, error: "相手の既定値が不正です。" });
    expect(calls.some((c) => ["insert", "update", "upsert"].includes(c.method))).toBe(false);
  });

  it("U-137: 管理者でないメンバーも名前を変更できる。共通の既定値は変更しない", async () => {
    const { client, calls } = fakeSupabase({
      existing: row(),
      write: { data: row({ name: "新しい名前" }), error: null },
    });
    signIn(client, USER_B, false);

    const result = await updatePayee(10, { name: " 新しい名前 " });

    expect(result).toMatchObject({ success: true, payee: { name: "新しい名前" } });
    // 更新するのは名前だけ（既定値の列は送らない）
    expect(writtenValues(calls, "update")).toEqual({ name: "新しい名前" });
  });

  it("U-109: 既定値のタグを保存し、返す支払い先に反映する（自分用の既定値では入れ替える）", async () => {
    const created = fakeSupabase({ write: { data: row(), error: null } });
    signIn(created.client, USER_A, true);
    const createResult = await createPayee({
      name: "スーパー",
      defaults: { ...EMPTY_PAYEE_DEFAULTS, tagIds: ["7", "8"] },
    });
    expect(createResult).toMatchObject({ success: true, payee: { defaults: { tagIds: ["7", "8"] } } });
    const createInserts = created.calls.filter((c) => c.method === "insert");
    expect(createInserts[1].args[0]).toEqual([
      { payee_id: 10, tag_id: 7 },
      { payee_id: 10, tag_id: 8 },
    ]);

    // 共通の既定値のタグは追加するだけ（消さない）
    expect(created.calls.filter((c) => c.method === "delete")).toHaveLength(0);

    const updated = fakeSupabase({
      existing: row({ payee_default_tags: [{ tag_id: 7 }] }),
      write: {
        data: row({
          payee_default_tags: [{ tag_id: 7 }],
          payee_member_defaults: [
            {
              user_id: USER_A,
              ...row(),
              payee_member_default_tags: [{ tag_id: 8 }],
            },
          ],
        }),
        error: null,
      },
    });
    signIn(updated.client, USER_A, true);
    const updateResult = await setOwnPayeeDefaults(10, { ...EMPTY_PAYEE_DEFAULTS, tagIds: ["8"] });
    expect(updateResult).toMatchObject({
      success: true,
      payee: {
        defaults: { tagIds: ["7"] },
        memberDefaults: [{ userId: USER_A, defaults: { tagIds: ["8"] } }],
      },
    });
    // 自分用のタグを消してから入れ直す。共通の既定値のタグには触れない
    expect(updated.client.from).toHaveBeenCalledWith("payee_member_default_tags");
    expect(updated.client.from).not.toHaveBeenCalledWith("payee_default_tags");
    expect(updated.calls.filter((c) => c.method === "delete")).toHaveLength(1);
    expect(updated.calls.find((c) => c.method === "insert")?.args[0]).toEqual([
      { payee_id: 10, user_id: USER_A, tag_id: 8 },
    ]);
  });

  it("U-109: グループにないタグは既定値に保存しない", async () => {
    const { client, calls } = fakeSupabase({ existing: row() });
    signIn(client, USER_A, true);
    expect(
      await setOwnPayeeDefaults(10, { ...EMPTY_PAYEE_DEFAULTS, tagIds: ["99"] })
    ).toEqual({ success: false, error: "タグの既定値が不正です。" });
    expect(calls.some((c) => ["update", "insert", "delete", "upsert"].includes(c.method))).toBe(
      false
    );
  });

  it("U-139: 自分用の既定値を保存する（自分の行だけ。共通の既定値は更新しない）", async () => {
    const { client, calls } = fakeSupabase({
      existing: row({ default_category_id: 1 }),
      write: {
        data: row({
          default_category_id: 1,
          payee_member_defaults: [
            {
              ...row(),
              user_id: USER_B,
              default_category_id: 2,
              default_breakdown_id: 21,
              default_owner_joint: true,
              payee_member_default_tags: [],
            },
          ],
        }),
        error: null,
      },
    });
    signIn(client, USER_B, false);

    const result = await setOwnPayeeDefaults(10, {
      ...EMPTY_PAYEE_DEFAULTS,
      categoryId: "2",
      breakdownId: "21",
      ownerUserId: OWNER_JOINT_VALUE,
    });

    expect(result).toMatchObject({
      success: true,
      payee: {
        defaults: { categoryId: "1" },
        memberDefaults: [
          {
            userId: USER_B,
            defaults: { categoryId: "2", breakdownId: "21", ownerUserId: OWNER_JOINT_VALUE },
          },
        ],
      },
    });
    expect(client.from).toHaveBeenCalledWith("payee_member_defaults");
    expect(calls.find((c) => c.method === "upsert")?.args).toEqual([
      {
        payee_id: 10,
        user_id: USER_B,
        default_category_id: 2,
        default_breakdown_id: 21,
        default_counterpart_id: null,
        default_owner_joint: true,
        default_owner_user_id: null,
        default_item_name: null,
      },
      { onConflict: "payee_id,user_id" },
    ]);
    // 支払い先（共通の既定値）は更新しない。タグは空なので追加しない
    expect(calls.some((c) => c.method === "update")).toBe(false);
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("U-141: 管理者でないメンバーも共通の既定値を変更でき、タグは入れ替える", async () => {
    const { client, calls } = fakeSupabase({
      existing: row({ payee_default_tags: [{ tag_id: 7 }] }),
      write: {
        data: row({ default_category_id: 2, default_owner_joint: true, payee_default_tags: [{ tag_id: 8 }] }),
        error: null,
      },
    });
    signIn(client, USER_B, false);

    const result = await updatePayeeCommonDefaults(10, {
      ...EMPTY_PAYEE_DEFAULTS,
      categoryId: "2",
      ownerUserId: OWNER_JOINT_VALUE,
      tagIds: ["8"],
    });

    expect(result).toMatchObject({
      success: true,
      payee: { defaults: { categoryId: "2", ownerUserId: OWNER_JOINT_VALUE, tagIds: ["8"] } },
    });
    expect(writtenValues(calls, "update")).toEqual({
      default_category_id: 2,
      default_breakdown_id: null,
      default_counterpart_id: null,
      default_owner_joint: true,
      default_owner_user_id: null,
      default_item_name: null,
    });
    // 自分のグループの支払い先だけを更新し、共通の既定値のタグを消してから入れ直す（自分用には触れない）
    expect(calls).toEqual(expect.arrayContaining([{ method: "eq", args: ["group_id", "group-1"] }]));
    expect(client.from).toHaveBeenCalledWith("payee_default_tags");
    expect(client.from).not.toHaveBeenCalledWith("payee_member_defaults");
    expect(calls.filter((c) => c.method === "delete")).toHaveLength(1);
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual([{ payee_id: 10, tag_id: 8 }]);
  });

  it("U-141: 不正な既定値・他グループの支払い先は変更しない", async () => {
    const invalid = fakeSupabase({ existing: row() });
    signIn(invalid.client, USER_A, true);
    expect(
      await updatePayeeCommonDefaults(10, { ...EMPTY_PAYEE_DEFAULTS, counterpartId: "99" })
    ).toEqual({ success: false, error: "相手の既定値が不正です。" });

    const missing = fakeSupabase({ existing: null });
    signIn(missing.client, USER_A, true);
    expect(await updatePayeeCommonDefaults(999, EMPTY_PAYEE_DEFAULTS)).toEqual({
      success: false,
      error: "支払い先が見つかりません。",
    });
    for (const { calls } of [invalid, missing]) {
      expect(calls.some((c) => ["update", "insert", "delete"].includes(c.method))).toBe(false);
    }
  });

  it("U-139: 共通に戻すと、自分用の既定値だけを削除する", async () => {
    const { client, calls } = fakeSupabase({
      existing: row(),
      write: { data: row(), error: null },
    });
    signIn(client, USER_B, false);

    const result = await resetOwnPayeeDefaults(10);

    expect(result).toMatchObject({ success: true, payee: { memberDefaults: [] } });
    expect(client.from).toHaveBeenCalledWith("payee_member_defaults");
    expect(calls).toEqual(
      expect.arrayContaining([
        { method: "delete", args: [] },
        { method: "eq", args: ["payee_id", 10] },
        { method: "eq", args: ["user_id", USER_B] },
      ])
    );
  });

  it("U-138: 自分の分だけ非表示にできる（支払い先そのものは更新しない）", async () => {
    const { client, calls } = fakeSupabase({
      existing: row({ payee_hidden_members: [{ user_id: USER_B }] }),
    });
    signIn(client, USER_B, false);

    const result = await setPayeeHidden(10, true);

    expect(result).toMatchObject({ success: true, payee: { hiddenUserIds: [USER_B] } });
    expect(client.from).toHaveBeenCalledWith("payee_hidden_members");
    expect(calls.find((c) => c.method === "upsert")?.args[0]).toEqual({
      payee_id: 10,
      user_id: USER_B,
    });
    expect(calls.some((c) => c.method === "update")).toBe(false);
  });

  it("U-138: 表示に戻すときは、自分の非表示だけを消す", async () => {
    const { client, calls } = fakeSupabase({
      existing: row({ payee_hidden_members: [{ user_id: USER_A }, { user_id: USER_B }] }),
      // 自分（B）の分だけが消え、相方（A）の非表示は残る
      write: { data: row({ payee_hidden_members: [{ user_id: USER_A }] }), error: null },
    });
    signIn(client, USER_B, false);

    const result = await setPayeeHidden(10, false);

    expect(result).toMatchObject({ success: true, payee: { hiddenUserIds: [USER_A] } });
    expect(calls).toEqual(
      expect.arrayContaining([
        { method: "delete", args: [] },
        { method: "eq", args: ["payee_id", 10] },
        { method: "eq", args: ["user_id", USER_B] },
      ])
    );
  });

  it("U-137: 管理者でないメンバーも削除できる。使われている支払い先は削除できず、非表示を案内する（23503）", async () => {
    const used = fakeSupabase({ write: { data: null, error: { code: "23503" } } });
    signIn(used.client, USER_B, false);
    expect(await deletePayee(10)).toEqual({
      success: false,
      error:
        "この支払い先は登録済みのレシートで使われているため削除できません。使わない場合は非表示にしてください。",
    });

    const unused = fakeSupabase({ write: { data: { id: 10 }, error: null } });
    signIn(unused.client, USER_B, false);
    expect(await deletePayee(10)).toEqual({ success: true });
    // 自分のグループの支払い先だけを対象にする
    expect(unused.calls).toEqual(
      expect.arrayContaining([{ method: "eq", args: ["group_id", "group-1"] }])
    );
  });

  it("U-109: 他グループ・存在しない支払い先は変更・削除・表示の切り替えができない", async () => {
    const { client, calls } = fakeSupabase({ existing: null, write: { data: null, error: null } });
    signIn(client, USER_A, true);
    const expected = { success: false, error: "支払い先が見つかりません。" };
    expect(await setPayeeHidden(999, true)).toEqual(expected);
    expect(await setOwnPayeeDefaults(999, EMPTY_PAYEE_DEFAULTS)).toEqual(expected);
    expect(await resetOwnPayeeDefaults(999)).toEqual(expected);
    expect(calls.some((c) => ["update", "upsert", "delete"].includes(c.method))).toBe(false);
    // 名前の変更・削除は、自分のグループの支払い先だけを対象にして、該当がなければ見つからない
    expect(await updatePayee(999, { name: "変更" })).toEqual(expected);
    expect(await deletePayee(999)).toEqual(expected);
    expect(calls).toEqual(
      expect.arrayContaining([{ method: "eq", args: ["group_id", "group-1"] }])
    );
  });

  // 分析拡充 F5：支払い先の別名
  it("U-128: 別名を追加すると、DBの add_payee_alias で過去のレシートも切り替え、件数を返す", async () => {
    const { client } = fakeSupabase({
      existing: row(),
      rpc: { data: { id: 5, name: "オーケー長津田店", converted: 15 }, error: null },
    });
    // 管理者でないメンバーも追加できる
    signIn(client, USER_B, false);

    const result = await addPayeeAlias(10, " オーケー長津田店 ");

    expect(result).toEqual({
      success: true,
      alias: { id: 5, name: "オーケー長津田店" },
      converted: 15,
    });
    expect(client.rpc).toHaveBeenCalledWith("add_payee_alias", {
      p_payee_id: 10,
      p_name: "オーケー長津田店",
    });
  });

  it("U-128: 空の別名・存在しない（他グループの）支払い先には追加・削除しない", async () => {
    expect(await addPayeeAlias(10, "　")).toEqual({
      success: false,
      error: "別名を入力してください。",
    });

    const missing = fakeSupabase({ existing: null });
    signIn(missing.client, USER_A, true);
    const expected = { success: false, error: "支払い先が見つかりません。" };
    expect(await addPayeeAlias(10, "別名")).toEqual(expected);
    expect(await deletePayeeAlias(10, 5)).toEqual(expected);
    expect(missing.client.rpc).not.toHaveBeenCalled();
    expect(missing.calls.some((c) => c.method === "delete")).toBe(false);
  });

  it("U-128: 重複する別名・支払い先の名前と同じ別名はエラーメッセージを返す", async () => {
    const duplicate = fakeSupabase({
      existing: row(),
      rpc: {
        data: null,
        error: { code: "23505", message: 'duplicate key value violates unique constraint "payee_aliases_group_name_uniq"' },
      },
    });
    signIn(duplicate.client, USER_B, false);
    expect(await addPayeeAlias(10, "オーケー長津田店")).toEqual({
      success: false,
      error: "この別名は既に登録されています。",
    });

    const sameAsPayee = fakeSupabase({
      existing: row(),
      rpc: { data: null, error: { code: "23505", message: "payee alias conflicts with a payee name" } },
    });
    signIn(sameAsPayee.client, USER_B, false);
    expect(await addPayeeAlias(10, "myTOKYOGAS")).toEqual({
      success: false,
      error: "同じ名前の支払い先があるため、別名にできません。",
    });

    // 支払い先の名前を、別名として登録済みの名前にはできない
    const rename = fakeSupabase({
      existing: row(),
      write: { data: null, error: { code: "23505", message: "payee name conflicts with an alias" } },
    });
    signIn(rename.client, USER_A, true);
    expect(await updatePayee(10, { name: "オーケー長津田店" })).toEqual({
      success: false,
      error: "同じ名前の別名が登録されています。",
    });
  });

  it("U-128: 別名を削除できる（存在しない別名はエラー）", async () => {
    const deleted = fakeSupabase({
      existing: row(),
      write: { data: { id: 5 }, error: null },
    });
    signIn(deleted.client, USER_B, false);
    expect(await deletePayeeAlias(10, 5)).toEqual({ success: true });
    expect(deleted.client.from).toHaveBeenCalledWith("payee_aliases");
    expect(deleted.calls).toEqual(
      expect.arrayContaining([
        { method: "delete", args: [] },
        { method: "eq", args: ["id", 5] },
        { method: "eq", args: ["payee_id", 10] },
      ])
    );

    const missing = fakeSupabase({
      existing: row(),
      write: { data: null, error: null },
    });
    signIn(missing.client, USER_B, false);
    expect(await deletePayeeAlias(10, 999)).toEqual({
      success: false,
      error: "別名が見つかりません。",
    });
  });
});
