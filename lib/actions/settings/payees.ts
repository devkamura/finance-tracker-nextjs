"use server";

import { requireGroupMembership, type MembershipContext } from "@/lib/settings/admin";
import {
  getCategoriesWithCostType,
  getCategoryBreakdowns,
  getCounterparts,
  getTags,
} from "@/lib/settings/queries";
import { getGroupMembers } from "@/lib/supabase/group";
import {
  EMPTY_PAYEE_DEFAULTS,
  PAYEE_SELECT,
  toPayee,
  toPayeeDefaultColumns,
  validatePayeeDefaults,
  type Payee,
  type PayeeAlias,
  type PayeeDefaults,
  type PayeeRow,
} from "@/lib/receipts/payees";

// 設定 ＞ 支払い先の操作（docs/分析拡充/基本設計書.md 2.6節・4.2節）。
// グループ全体の支払い先は管理者のみ、自分用の支払い先は登録したユーザー本人のみ編集できる。
// 相方の自分用は閲覧のみ（RLSでも制限する）。

export type PayeeScope = "shared" | "own";

export type PayeeActionResult =
  | { success: true; payee: Payee }
  | { success: false; error: string };

export type DeletePayeeResult = { success: true } | { success: false; error: string };

const DUPLICATE_NAME = "同じ名前の支払い先が既に存在します。";

// 名前の重複（23505）のメッセージ。グループ全体と自分用の間の重複はDBのトリガー
// （check_payee_name_across_scopes）で防いでおり、どちらと重なったかをメッセージから判断する。
function duplicateNameError(error: { message?: string }): string {
  if (error.message?.includes("conflicts with a shared payee")) {
    return "グループ全体に同じ名前の支払い先があります。";
  }
  if (error.message?.includes("conflicts with an own payee")) {
    return "メンバーの自分用に同じ名前の支払い先があります。";
  }
  if (error.message?.includes("payee name conflicts with an alias")) {
    return "同じ名前の別名が登録されています。";
  }
  return DUPLICATE_NAME;
}
const EMPTY_NAME = "支払い先名を入力してください。";
const SHARED_ADMIN_ONLY = "グループ全体の支払い先は管理者のみ編集できます。";
const NOT_OWNER = "他のメンバーの支払い先は編集できません。";

// 既定値の入力チェック。グループのカテゴリ・内訳・相手・メンバーと照らし合わせる。
async function checkDefaults(
  context: MembershipContext,
  defaults: PayeeDefaults,
  current: PayeeDefaults = EMPTY_PAYEE_DEFAULTS
): Promise<string | null> {
  const { supabase, groupId } = context;
  const [categories, breakdowns, tags, members] = await Promise.all([
    getCategoriesWithCostType(supabase, groupId),
    getCategoryBreakdowns(supabase, groupId),
    getTags(supabase, groupId),
    getGroupMembers(supabase, groupId),
  ]);
  const counterparts = await getCounterparts(supabase, groupId, members);
  return validatePayeeDefaults(
    defaults,
    { categories, breakdowns, counterparts, tags, members },
    current
  );
}

// 既定値のタグ（payee_default_tags）を、指定したタグに入れ替える。失敗したらエラーメッセージを返す。
async function replaceDefaultTags(
  context: MembershipContext,
  payeeId: number,
  tagIds: string[]
): Promise<string | null> {
  const { error: deleteError } = await context.supabase
    .from("payee_default_tags")
    .delete()
    .eq("payee_id", payeeId);
  if (deleteError) {
    console.error("Failed to delete payee default tags", deleteError);
    return "既定値のタグの保存に失敗しました。";
  }
  if (tagIds.length === 0) {
    return null;
  }
  const { error: insertError } = await context.supabase
    .from("payee_default_tags")
    .insert(tagIds.map((tagId) => ({ payee_id: payeeId, tag_id: Number(tagId) })));
  if (insertError) {
    console.error("Failed to insert payee default tags", insertError);
    return "既定値のタグの保存に失敗しました。";
  }
  return null;
}

// 保存したタグを、返す支払い先の既定値に反映する
function withTagIds(payee: Payee, tagIds: string[]): Payee {
  return { ...payee, defaults: { ...payee.defaults, tagIds } };
}

// 対象の支払い先を編集できるか（グループ全体は管理者、自分用は本人）。編集できれば null。
function editPermissionError(context: MembershipContext, ownerUserId: string | null) {
  if (ownerUserId === null) {
    return context.isAdmin ? null : SHARED_ADMIN_ONLY;
  }
  return ownerUserId === context.userId ? null : NOT_OWNER;
}

// 支払い先を追加する。scope が "shared" ならグループ全体、"own" なら自分用。
export async function createPayee(input: {
  scope: PayeeScope;
  name: string;
  defaults?: PayeeDefaults;
}): Promise<PayeeActionResult> {
  const trimmed = input.name.trim();
  if (!trimmed) {
    return { success: false, error: EMPTY_NAME };
  }

  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;
  const ownerUserId = input.scope === "own" ? context.userId : null;
  const permissionError = editPermissionError(context, ownerUserId);
  if (permissionError) {
    return { success: false, error: permissionError };
  }

  const defaults = input.defaults ?? EMPTY_PAYEE_DEFAULTS;
  const defaultsError = await checkDefaults(context, defaults);
  if (defaultsError) {
    return { success: false, error: defaultsError };
  }

  const { data, error } = await context.supabase
    .from("payees")
    .insert({
      group_id: context.groupId,
      owner_user_id: ownerUserId,
      name: trimmed,
      ...toPayeeDefaultColumns(defaults),
    })
    .select(PAYEE_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: duplicateNameError(error) };
    }
    console.error("Failed to create payee", error);
    return { success: false, error: "支払い先の登録に失敗しました。" };
  }
  const payee = toPayee(data as PayeeRow);

  const tagError = await replaceDefaultTags(context, payee.id, defaults.tagIds);
  if (tagError) {
    // 既定値のタグだけが欠けた支払い先を残さないよう、追加した支払い先を取り消す
    await context.supabase.from("payees").delete().eq("id", payee.id);
    return { success: false, error: tagError };
  }
  return { success: true, payee: withTagIds(payee, defaults.tagIds) };
}

// 支払い先の名前・既定値の変更、または表示・非表示の切り替え。
export async function updatePayee(
  id: number,
  patch: { name?: string; isHidden?: boolean; defaults?: PayeeDefaults }
): Promise<PayeeActionResult> {
  if (patch.name !== undefined && !patch.name.trim()) {
    return { success: false, error: EMPTY_NAME };
  }

  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;

  const { data: existing } = await context.supabase
    .from("payees")
    .select(PAYEE_SELECT)
    .eq("id", id)
    .eq("group_id", context.groupId)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "支払い先が見つかりません。" };
  }
  const current = toPayee(existing as PayeeRow);
  const permissionError = editPermissionError(context, current.ownerUserId);
  if (permissionError) {
    return { success: false, error: permissionError };
  }

  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    values.name = patch.name.trim();
  }
  if (patch.isHidden !== undefined) {
    values.is_hidden = patch.isHidden;
  }
  if (patch.defaults !== undefined) {
    const defaultsError = await checkDefaults(context, patch.defaults, current.defaults);
    if (defaultsError) {
      return { success: false, error: defaultsError };
    }
    Object.assign(values, toPayeeDefaultColumns(patch.defaults));
  }

  const { data, error } = await context.supabase
    .from("payees")
    .update(values)
    .eq("id", id)
    .eq("group_id", context.groupId)
    .select(PAYEE_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: duplicateNameError(error) };
    }
    console.error("Failed to update payee", error);
    return { success: false, error: "支払い先の更新に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "権限がありません。" };
  }
  const payee = toPayee(data as PayeeRow);

  if (patch.defaults !== undefined) {
    const tagError = await replaceDefaultTags(context, id, patch.defaults.tagIds);
    if (tagError) {
      return { success: false, error: tagError };
    }
    return { success: true, payee: withTagIds(payee, patch.defaults.tagIds) };
  }
  return { success: true, payee };
}

// 支払い先を削除する。登録済みのレシートで使われている支払い先は、DBの外部キーで
// 削除できないため、非表示を案内する（基本設計書 Q4）。
export async function deletePayee(id: number): Promise<DeletePayeeResult> {
  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;

  const { data: existing } = await context.supabase
    .from("payees")
    .select("id, owner_user_id")
    .eq("id", id)
    .eq("group_id", context.groupId)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "支払い先が見つかりません。" };
  }
  const permissionError = editPermissionError(context, existing.owner_user_id);
  if (permissionError) {
    return { success: false, error: permissionError };
  }

  const { data, error } = await context.supabase
    .from("payees")
    .delete()
    .eq("id", id)
    .eq("group_id", context.groupId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error:
          "この支払い先は登録済みのレシートで使われているため削除できません。非表示にしてください。",
      };
    }
    console.error("Failed to delete payee", error);
    return { success: false, error: "支払い先の削除に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "権限がありません。" };
  }
  return { success: true };
}

export type AddPayeeAliasResult =
  | { success: true; alias: PayeeAlias; converted: number }
  | { success: false; error: string };

// 対象の支払い先がグループにあり、編集できるか（グループ全体は管理者、自分用は本人）確かめる。
async function editablePayee(
  context: MembershipContext,
  payeeId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await context.supabase
    .from("payees")
    .select("id, owner_user_id")
    .eq("id", payeeId)
    .eq("group_id", context.groupId)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "支払い先が見つかりません。" };
  }
  const permissionError = editPermissionError(context, existing.owner_user_id);
  return permissionError ? { ok: false, error: permissionError } : { ok: true };
}

// 別名を追加する（docs/分析拡充/要件定義書.md 4.7節）。追加と同時に、店名が別名と一致する過去のレシートを
// この支払い先に切り替える（DBの add_payee_alias。切り替えた件数を返す）。
export async function addPayeeAlias(
  payeeId: number,
  name: string
): Promise<AddPayeeAliasResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: "別名を入力してください。" };
  }

  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;
  const editable = await editablePayee(context, payeeId);
  if (!editable.ok) {
    return { success: false, error: editable.error };
  }

  const { data, error } = await context.supabase.rpc("add_payee_alias", {
    p_payee_id: payeeId,
    p_name: trimmed,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: error.message?.includes("conflicts with a payee name")
          ? "同じ名前の支払い先があるため、別名にできません。"
          : "この別名は既に登録されています。",
      };
    }
    console.error("Failed to add payee alias", error);
    return { success: false, error: "別名の登録に失敗しました。" };
  }
  const result = data as { id: number; name: string; converted: number };
  return {
    success: true,
    alias: { id: result.id, name: result.name },
    converted: result.converted,
  };
}

// 別名を削除する。切り替え済みのレシートは元に戻さない。
export async function deletePayeeAlias(
  payeeId: number,
  aliasId: number
): Promise<DeletePayeeResult> {
  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;
  const editable = await editablePayee(context, payeeId);
  if (!editable.ok) {
    return { success: false, error: editable.error };
  }

  const { data, error } = await context.supabase
    .from("payee_aliases")
    .delete()
    .eq("id", aliasId)
    .eq("payee_id", payeeId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Failed to delete payee alias", error);
    return { success: false, error: "別名の削除に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: "別名が見つかりません。" };
  }
  return { success: true };
}
