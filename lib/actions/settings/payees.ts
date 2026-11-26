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
  ownPayeeDefaults,
  PAYEE_SELECT,
  toPayee,
  toPayeeCommonDefaultColumns,
  toPayeeDefaultColumns,
  validatePayeeDefaults,
  type Payee,
  type PayeeAlias,
  type PayeeDefaults,
  type PayeeRow,
} from "@/lib/receipts/payees";

// 設定 ＞ 支払い先の操作（docs/全体仕様書/基本設計書.md 5.3節）。
// 登録・名前の変更・削除はグループのメンバー全員ができる（管理者と非管理者を区別しない）。
// 既定値は、登録したときの内容が共通の既定値になる。共通の既定値は登録後もメンバー全員が変更でき、
// 共通の変更の影響を受けたくないメンバーは自分用の既定値で上書きできる。表示／非表示・自分用の既定値は自分の分だけ変えられる。
// 他グループの支払い先はRLSでも操作できない。

export type PayeeActionResult =
  | { success: true; payee: Payee }
  | { success: false; error: string };

export type DeletePayeeResult = { success: true } | { success: false; error: string };

const DUPLICATE_NAME = "同じ名前の支払い先が既に存在します。";

// 名前の重複（23505）のメッセージ。別名との重複はDBのトリガー（check_payee_name_not_alias）で
// 防いでおり、メッセージから判断する。
function duplicateNameError(error: { message?: string }): string {
  if (error.message?.includes("payee name conflicts with an alias")) {
    return "同じ名前の別名が登録されています。";
  }
  return DUPLICATE_NAME;
}
const EMPTY_NAME = "支払い先名を入力してください。";
const NOT_FOUND = "支払い先が見つかりません。";

// 既定値の入力チェック。グループのカテゴリ・内訳・相手・メンバーと照らし合わせる。
// 「登録する人」は共通の既定値（common: true）でだけ受け付ける（Issue #44）。
async function checkDefaults(
  context: MembershipContext,
  defaults: PayeeDefaults,
  { common, current = EMPTY_PAYEE_DEFAULTS }: { common: boolean; current?: PayeeDefaults }
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
    current,
    { allowRegistrant: common }
  );
}

// 共通の既定値のタグ（payee_default_tags）を登録する（支払い先の追加・共通の既定値の変更）。
// 失敗したらエラーメッセージを返す。
async function insertDefaultTags(
  context: MembershipContext,
  payeeId: number,
  tagIds: string[]
): Promise<string | null> {
  if (tagIds.length === 0) {
    return null;
  }
  const { error } = await context.supabase
    .from("payee_default_tags")
    .insert(tagIds.map((tagId) => ({ payee_id: payeeId, tag_id: Number(tagId) })));
  if (error) {
    console.error("Failed to insert payee default tags", error);
    return "既定値のタグの保存に失敗しました。";
  }
  return null;
}

// 保存したタグを、返す支払い先の既定値に反映する
function withTagIds(payee: Payee, tagIds: string[]): Payee {
  return { ...payee, defaults: { ...payee.defaults, tagIds } };
}

// 支払い先を取り直す（自分のグループの支払い先だけ）。なければ null。
async function fetchPayee(context: MembershipContext, id: number): Promise<Payee | null> {
  const { data } = await context.supabase
    .from("payees")
    .select(PAYEE_SELECT)
    .eq("id", id)
    .eq("group_id", context.groupId)
    .maybeSingle();
  return data ? toPayee(data as PayeeRow) : null;
}

// 支払い先を追加する。追加した支払い先は全員に表示される。入力した既定値が共通の既定値になる。
export async function createPayee(input: {
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

  const defaults = input.defaults ?? EMPTY_PAYEE_DEFAULTS;
  const defaultsError = await checkDefaults(context, defaults, { common: true });
  if (defaultsError) {
    return { success: false, error: defaultsError };
  }

  const { data, error } = await context.supabase
    .from("payees")
    .insert({
      group_id: context.groupId,
      name: trimmed,
      ...toPayeeCommonDefaultColumns(defaults),
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

  const tagError = await insertDefaultTags(context, payee.id, defaults.tagIds);
  if (tagError) {
    // 既定値のタグだけが欠けた支払い先を残さないよう、追加した支払い先を取り消す
    await context.supabase.from("payees").delete().eq("id", payee.id);
    return { success: false, error: tagError };
  }
  return { success: true, payee: withTagIds(payee, defaults.tagIds) };
}

// 支払い先の名前の変更（メンバー全員）。共通の既定値は updatePayeeCommonDefaults、
// 自分用の既定値は setOwnPayeeDefaults で変える。
export async function updatePayee(
  id: number,
  patch: { name: string }
): Promise<PayeeActionResult> {
  const name = patch.name.trim();
  if (!name) {
    return { success: false, error: EMPTY_NAME };
  }

  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;

  const { data, error } = await context.supabase
    .from("payees")
    .update({ name })
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
    return { success: false, error: NOT_FOUND };
  }
  return { success: true, payee: toPayee(data as PayeeRow) };
}

// 共通の既定値を変更する（メンバー全員）。自分用の既定値を持たないメンバーの自動入力に反映される。
// 非表示の内訳・相手・タグは、今の共通の既定値にあるときだけ残せる。
export async function updatePayeeCommonDefaults(
  id: number,
  defaults: PayeeDefaults
): Promise<PayeeActionResult> {
  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;

  const current = await fetchPayee(context, id);
  if (!current) {
    return { success: false, error: NOT_FOUND };
  }
  const defaultsError = await checkDefaults(context, defaults, {
    common: true,
    current: current.defaults,
  });
  if (defaultsError) {
    return { success: false, error: defaultsError };
  }

  const { error } = await context.supabase
    .from("payees")
    .update(toPayeeCommonDefaultColumns(defaults))
    .eq("id", id)
    .eq("group_id", context.groupId);
  if (error) {
    console.error("Failed to update payee common defaults", error);
    return { success: false, error: "共通の既定値の保存に失敗しました。" };
  }

  // タグを入れ替える
  const { error: deleteError } = await context.supabase
    .from("payee_default_tags")
    .delete()
    .eq("payee_id", id);
  const tagError = deleteError
    ? "既定値のタグの保存に失敗しました。"
    : await insertDefaultTags(context, id, defaults.tagIds);
  if (tagError) {
    if (deleteError) console.error("Failed to delete payee default tags", deleteError);
    return { success: false, error: tagError };
  }

  const payee = await fetchPayee(context, id);
  return payee ? { success: true, payee } : { success: false, error: NOT_FOUND };
}

// 自分用の既定値を保存する（なければ作る）。相方の既定値・共通の既定値は変えない。
// 非表示の内訳・相手・タグは、今の自分の既定値（なければ共通の既定値）にあるときだけ残せる。
export async function setOwnPayeeDefaults(
  id: number,
  defaults: PayeeDefaults
): Promise<PayeeActionResult> {
  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;

  const current = await fetchPayee(context, id);
  if (!current) {
    return { success: false, error: NOT_FOUND };
  }
  // 自分用の既定値では「登録する人」を選べない（本人を選ぶのと同じ結果になるため）
  const defaultsError = await checkDefaults(context, defaults, {
    common: false,
    current: ownPayeeDefaults(current, context.userId) ?? current.defaults,
  });
  if (defaultsError) {
    return { success: false, error: defaultsError };
  }

  const { error } = await context.supabase
    .from("payee_member_defaults")
    .upsert(
      { payee_id: id, user_id: context.userId, ...toPayeeDefaultColumns(defaults) },
      { onConflict: "payee_id,user_id" }
    );
  if (error) {
    console.error("Failed to save own payee defaults", error);
    return { success: false, error: "自分用の既定値の保存に失敗しました。" };
  }

  // タグを入れ替える
  const { error: deleteError } = await context.supabase
    .from("payee_member_default_tags")
    .delete()
    .eq("payee_id", id)
    .eq("user_id", context.userId);
  const { error: insertError } =
    deleteError || defaults.tagIds.length === 0
      ? { error: null }
      : await context.supabase.from("payee_member_default_tags").insert(
          defaults.tagIds.map((tagId) => ({
            payee_id: id,
            user_id: context.userId,
            tag_id: Number(tagId),
          }))
        );
  if (deleteError || insertError) {
    console.error("Failed to save own payee default tags", deleteError ?? insertError);
    return { success: false, error: "既定値のタグの保存に失敗しました。" };
  }

  const payee = await fetchPayee(context, id);
  return payee ? { success: true, payee } : { success: false, error: NOT_FOUND };
}

// 自分用の既定値を削除し、共通の既定値に戻す（タグは cascade で消える）。
export async function resetOwnPayeeDefaults(id: number): Promise<PayeeActionResult> {
  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;
  const exists = await payeeExists(context, id);
  if (!exists.ok) {
    return { success: false, error: exists.error };
  }

  const { error } = await context.supabase
    .from("payee_member_defaults")
    .delete()
    .eq("payee_id", id)
    .eq("user_id", context.userId);
  if (error) {
    console.error("Failed to reset own payee defaults", error);
    return { success: false, error: "共通の既定値に戻せませんでした。" };
  }

  const payee = await fetchPayee(context, id);
  return payee ? { success: true, payee } : { success: false, error: NOT_FOUND };
}

// 支払い先を削除する。登録済みのレシートで使われている支払い先は、DBの外部キーで
// 削除できないため、非表示を案内する（基本設計書 Q4）。
export async function deletePayee(id: number): Promise<DeletePayeeResult> {
  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;

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
          "この支払い先は登録済みのレシートで使われているため削除できません。使わない場合は非表示にしてください。",
      };
    }
    console.error("Failed to delete payee", error);
    return { success: false, error: "支払い先の削除に失敗しました。" };
  }
  if (!data) {
    return { success: false, error: NOT_FOUND };
  }
  return { success: true };
}

// 自分の表示／非表示を切り替える。非表示にすると自分のプルダウンに出なくなる
// （相方のプルダウン・過去のレシート・分析には影響しない）。相方の分は変えられない。
export async function setPayeeHidden(id: number, hidden: boolean): Promise<PayeeActionResult> {
  const auth = await requireGroupMembership();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const context = auth.context;
  const exists = await payeeExists(context, id);
  if (!exists.ok) {
    return { success: false, error: exists.error };
  }

  const { error } = hidden
    ? await context.supabase
        .from("payee_hidden_members")
        .upsert(
          { payee_id: id, user_id: context.userId },
          { onConflict: "payee_id,user_id", ignoreDuplicates: true }
        )
    : await context.supabase
        .from("payee_hidden_members")
        .delete()
        .eq("payee_id", id)
        .eq("user_id", context.userId);
  if (error) {
    console.error("Failed to switch payee visibility", error);
    return { success: false, error: "表示の切り替えに失敗しました。" };
  }

  const payee = await fetchPayee(context, id);
  return payee ? { success: true, payee } : { success: false, error: NOT_FOUND };
}

export type AddPayeeAliasResult =
  | { success: true; alias: PayeeAlias; converted: number }
  | { success: false; error: string };

// 対象の支払い先が自分のグループにあるか確かめる（他グループの支払い先は操作できない）。
async function payeeExists(
  context: MembershipContext,
  payeeId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await context.supabase
    .from("payees")
    .select("id")
    .eq("id", payeeId)
    .eq("group_id", context.groupId)
    .maybeSingle();
  return existing ? { ok: true } : { ok: false, error: NOT_FOUND };
}

// 別名を追加する（docs/全体仕様書/基本設計書.md 5.3節）。追加と同時に、店名が別名と一致する過去のレシートを
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
  const exists = await payeeExists(context, payeeId);
  if (!exists.ok) {
    return { success: false, error: exists.error };
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
  const exists = await payeeExists(context, payeeId);
  if (!exists.ok) {
    return { success: false, error: exists.error };
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
