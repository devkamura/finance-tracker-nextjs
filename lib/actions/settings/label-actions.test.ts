import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCounterpart,
  deleteCounterpart,
  updateCounterpart,
} from "@/lib/actions/settings/counterparts";
import { createTag, deleteTag, updateTag } from "@/lib/actions/settings/tags";
import { requireGroupAdmin } from "@/lib/settings/admin";

vi.mock("@/lib/settings/admin", () => ({ requireGroupAdmin: vi.fn() }));

const mockedRequireGroupAdmin = vi.mocked(requireGroupAdmin);

// Supabaseのクエリビルダーを最小限に再現する（breakdown-actions.test.ts と同じ考え方）。
// 最初の limit 付きの maybeSingle は末尾の並び順の取得として last を返し、それ以外は write を返す。
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
    const isLookup = calls.some((c) => c.method === "limit") && maybeSingleCount === 1;
    return Promise.resolve(
      isLookup ? { data: results.last?.data ?? null, error: null } : results.write
    );
  };
  chain.single = () => Promise.resolve(results.write);
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

describe("相手の設定（Server Action）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("U-104: 管理者以外は相手を追加・変更・削除できない", async () => {
    mockedRequireGroupAdmin.mockResolvedValue({ ok: false, error: "管理者のみ編集できます。" });
    const expected = { success: false, error: "管理者のみ編集できます。" };
    expect(await createCounterpart("同僚")).toEqual(expected);
    expect(await updateCounterpart(10, { isHidden: true })).toEqual(expected);
    expect(await deleteCounterpart(10)).toEqual(expected);
  });

  it("U-104: 名前が空なら追加・名前の変更をしない", async () => {
    const expected = { success: false, error: "相手の名前を入力してください。" };
    expect(await createCounterpart(" ")).toEqual(expected);
    expect(await updateCounterpart(10, { name: "" })).toEqual(expected);
    expect(mockedRequireGroupAdmin).not.toHaveBeenCalled();
  });

  it("U-104: 任意の相手として末尾の並び順で追加する。同名はエラー", async () => {
    const { client, calls } = fakeSupabase({
      last: { data: { sort_order: 3 } },
      write: { data: { id: 10, name: "同僚", is_hidden: false }, error: null },
    });
    asAdmin(client);
    expect(await createCounterpart(" 同僚 ")).toEqual({
      success: true,
      counterpart: { id: 10, name: "同僚", isHidden: false },
    });
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({
      group_id: "group-1",
      kind: "custom",
      name: "同僚",
      sort_order: 4,
    });

    const { client: dup } = fakeSupabase({ write: { data: null, error: { code: "23505" } } });
    asAdmin(dup);
    expect(await createCounterpart("友人")).toEqual({
      success: false,
      error: "同じ名前の相手が既に存在します。",
    });
  });

  it("U-104: 名前の変更は任意の相手だけを対象にし、メンバー・既定の相手は変更できない", async () => {
    const { client, calls } = fakeSupabase({ write: { data: null, error: null } });
    asAdmin(client);
    expect(await updateCounterpart(1, { name: "家族" })).toEqual({
      success: false,
      error: "メンバー・既定の相手の名前は変更できません。",
    });
    expect(calls).toContainEqual({ method: "eq", args: ["kind", "custom"] });
  });

  it("U-104: メンバー・既定の相手も表示・非表示は切り替えられる", async () => {
    const { client, calls } = fakeSupabase({
      write: { data: { id: 1, name: null, is_hidden: true }, error: null },
    });
    asAdmin(client);
    expect(await updateCounterpart(1, { isHidden: true })).toEqual({
      success: true,
      counterpart: { id: 1, name: null, isHidden: true },
    });
    expect(calls.find((c) => c.method === "update")?.args[0]).toEqual({ is_hidden: true });
    expect(calls).not.toContainEqual({ method: "eq", args: ["kind", "custom"] });
  });

  it("U-104: 使われている相手は削除できず非表示を案内し、メンバー・既定の相手は削除できない", async () => {
    const { client } = fakeSupabase({ write: { data: null, error: { code: "23503" } } });
    asAdmin(client);
    expect(await deleteCounterpart(10)).toEqual({
      success: false,
      error: "この相手は登録済みの明細で使われているため削除できません。非表示にしてください。",
    });

    const { client: builtin, calls } = fakeSupabase({ write: { data: null, error: null } });
    asAdmin(builtin);
    expect(await deleteCounterpart(1)).toEqual({
      success: false,
      error: "メンバー・既定の相手は削除できません。",
    });
    expect(calls).toContainEqual({ method: "eq", args: ["kind", "custom"] });
  });
});

describe("タグの設定（Server Action）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("U-105: 管理者以外はタグを追加・変更・削除できない", async () => {
    mockedRequireGroupAdmin.mockResolvedValue({ ok: false, error: "管理者のみ編集できます。" });
    const expected = { success: false, error: "管理者のみ編集できます。" };
    expect(await createTag("朝食")).toEqual(expected);
    expect(await updateTag(5, { name: "昼食" })).toEqual(expected);
    expect(await deleteTag(5)).toEqual(expected);
  });

  it("U-105: 名前が空なら追加しない。末尾の並び順で追加し、同名はエラー", async () => {
    expect(await createTag("")).toEqual({ success: false, error: "タグ名を入力してください。" });

    const { client, calls } = fakeSupabase({
      last: { data: { sort_order: 7 } },
      write: { data: { id: 5, name: "朝食", is_hidden: false }, error: null },
    });
    asAdmin(client);
    expect(await createTag("朝食")).toEqual({
      success: true,
      tag: { id: 5, name: "朝食", isHidden: false },
    });
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({
      group_id: "group-1",
      name: "朝食",
      sort_order: 8,
    });

    const { client: dup } = fakeSupabase({ write: { data: null, error: { code: "23505" } } });
    asAdmin(dup);
    expect(await updateTag(5, { name: "昼食" })).toEqual({
      success: false,
      error: "同じ名前のタグが既に存在します。",
    });
  });

  it("U-105: 使われているタグは削除できず非表示を案内し、非表示にはできる", async () => {
    const { client } = fakeSupabase({ write: { data: null, error: { code: "23503" } } });
    asAdmin(client);
    expect(await deleteTag(5)).toEqual({
      success: false,
      error: "このタグは登録済みの明細で使われているため削除できません。非表示にしてください。",
    });

    const { client: hide } = fakeSupabase({
      write: { data: { id: 5, name: "朝食", is_hidden: true }, error: null },
    });
    asAdmin(hide);
    expect(await updateTag(5, { isHidden: true })).toEqual({
      success: true,
      tag: { id: 5, name: "朝食", isHidden: true },
    });
  });
});
