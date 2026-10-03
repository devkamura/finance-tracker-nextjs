import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CategoryBreakdown, CostType } from "@/lib/receipts/breakdowns";
import type { Counterpart, CounterpartKind, Tag } from "@/lib/receipts/labels";
import { PAYEE_SELECT, toPayee, type Payee, type PayeeRow } from "@/lib/receipts/payees";

// グループのカテゴリの内訳を取得する（非表示のものも含む。並び順→登録順）。
// 登録画面の選択肢・入力チェック、設定画面の両方で使う。
export async function getCategoryBreakdowns(
  supabase: SupabaseClient,
  groupId: string
): Promise<CategoryBreakdown[]> {
  const { data, error } = await supabase
    .from("category_breakdowns")
    .select("id, category_id, name, is_hidden")
    .eq("group_id", groupId)
    .order("sort_order")
    .order("id");
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    isHidden: row.is_hidden,
  }));
}

export type CategoryWithCostType = {
  id: number;
  name: string;
  costType: CostType;
};

// カテゴリと、グループでの費用区分を取得する。グループで設定していないカテゴリは
// カテゴリの初期値（categories.default_cost_type）を使う（基本設計書 3.2節）。
export async function getCategoriesWithCostType(
  supabase: SupabaseClient,
  groupId: string
): Promise<CategoryWithCostType[]> {
  const [{ data: categories, error: categoriesError }, { data: settings, error: settingsError }] =
    await Promise.all([
      supabase.from("categories").select("id, name, default_cost_type").order("id"),
      supabase.from("category_settings").select("category_id, cost_type").eq("group_id", groupId),
    ]);
  if (categoriesError) throw categoriesError;
  if (settingsError) throw settingsError;

  const overrides = new Map(
    (settings ?? []).map((s) => [s.category_id as number, s.cost_type as CostType])
  );
  return (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    costType: overrides.get(c.id) ?? (c.default_cost_type as CostType),
  }));
}

// グループの相手を取得する（非表示のものも含む。並び順→登録順。基本設計書 2.4節）。
// メンバーの相手の名前は、グループのメンバーの表示名を使う。グループから外れたメンバーの相手は
// 選択肢・設定画面に出さないため含めない（既存の明細の表示は receipts/queries.ts で行う）。
export async function getCounterparts(
  supabase: SupabaseClient,
  groupId: string,
  members: { userId: string; displayName: string }[]
): Promise<Counterpart[]> {
  const { data, error } = await supabase
    .from("counterparts")
    .select("id, kind, user_id, name, is_hidden")
    .eq("group_id", groupId)
    .order("sort_order")
    .order("id");
  if (error) {
    throw error;
  }
  const memberNames = new Map(members.map((m) => [m.userId, m.displayName]));
  return (data ?? []).flatMap((row) => {
    const kind = row.kind as CounterpartKind;
    const name = kind === "member" ? memberNames.get(row.user_id ?? "") : row.name;
    if (name === undefined || name === null) {
      return [];
    }
    return [{ id: row.id, kind, userId: row.user_id, name, isHidden: row.is_hidden }];
  });
}

// グループのタグを取得する（非表示のものも含む。並び順→登録順。基本設計書 2.5節）
export async function getTags(supabase: SupabaseClient, groupId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, is_hidden")
    .eq("group_id", groupId)
    .order("sort_order")
    .order("id");
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, isHidden: row.is_hidden }));
}

// グループの支払い先を取得する（グループ全体・全員の自分用・非表示のものも含む。名前順。基本設計書 2.6節）。
// 登録画面ではこのうちグループ全体と自分用だけを選択肢に出し（lib/receipts/payees.ts）、
// 設定画面では相方用も閲覧のみで表示する。
export async function getPayees(supabase: SupabaseClient, groupId: string): Promise<Payee[]> {
  const { data, error } = await supabase
    .from("payees")
    .select(PAYEE_SELECT)
    .eq("group_id", groupId)
    .order("name")
    .order("id");
  if (error) {
    throw error;
  }
  return ((data ?? []) as PayeeRow[]).map(toPayee);
}
