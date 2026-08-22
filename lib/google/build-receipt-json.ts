import type { SupabaseClient } from "@supabase/supabase-js";

import { SELECT_NONE_VALUE } from "@/lib/constants";
import type { ReceiptFormState } from "@/types/receipt";

function toYYYYMMDDHHmm(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function formatDatetime(input: string, now: Date): string {
  if (!input) return toYYYYMMDDHHmm(now);
  // "2026-08-17T14:53" -> "202608171453"
  return input.replace(/[-T:]/g, "");
}

async function fetchNameById(
  supabase: SupabaseClient,
  table: string,
  id: number
): Promise<string> {
  const { data, error } = await supabase
    .from(table)
    .select("name")
    .eq("id", id)
    .single();
  if (error || !data) {
    throw new Error(`${table}(id=${id})が見つかりません。`);
  }
  return data.name as string;
}

async function fetchNamesByIds(
  supabase: SupabaseClient,
  table: string,
  ids: number[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from(table)
    .select("name")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}

async function resolveStoreName(
  supabase: SupabaseClient,
  storeSelect: string,
  storeInputText: string
): Promise<string> {
  if (!storeSelect) return "";
  if (storeSelect === SELECT_NONE_VALUE) return storeInputText;

  return fetchNameById(supabase, "stores", Number(storeSelect));
}

export async function buildReceiptJson(
  supabase: SupabaseClient,
  state: ReceiptFormState,
  userDisplayName: string,
  now: Date
) {
  const [location, transactionTypeName] = await Promise.all([
    resolveStoreName(supabase, state.storeSelect, state.storeInputText),
    fetchNameById(
      supabase,
      "transaction_types",
      Number(state.transactionTypeId)
    ),
  ]);

  const items = await Promise.all(
    state.items.map(async (item) => {
      const [taxName, categoryName, purposeName, sceneNames] =
        await Promise.all([
          fetchNameById(supabase, "consumption_taxes", Number(item.taxRateId)),
          fetchNameById(supabase, "categories", Number(item.categoryId)),
          fetchNameById(supabase, "purposes", Number(item.purposeId)),
          fetchNamesByIds(supabase, "scenes", item.sceneIds.map(Number)),
        ]);

      return {
        price: Number(item.price),
        tax_rate: taxName,
        category: categoryName,
        purpose: purposeName,
        scene: sceneNames,
        memo: item.name,
      };
    })
  );

  return {
    user: userDisplayName,
    // OCR機能は未実装のため、読み取り原文は常に空文字列を出力する。
    text: "",
    location,
    datetime: formatDatetime(state.datetime, now),
    expense_or_refund: transactionTypeName,
    total_price: Number(state.amount),
    items,
  };
}
