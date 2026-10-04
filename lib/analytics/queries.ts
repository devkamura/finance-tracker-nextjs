import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { lastTwelveMonths, monthKeyOf, monthRange, todayKey } from "@/lib/analytics/months";
import { buildAnalyticsPayees } from "@/lib/analytics/payees";
import type { AnalyticsData, AnalyticsRow } from "@/lib/analytics/types";
import {
  getCategoriesWithCostType,
  getCategoryBreakdowns,
  getCounterpartNames,
  getPayees,
} from "@/lib/settings/queries";
import { allocateReceiptAmount } from "@/lib/settlement/calculate";
import { getGroupMembers } from "@/lib/supabase/group";
import { unwrapToOne } from "@/lib/supabase/unwrap";

// supabase/config.tomlのmax_rows(=1000)に合わせた1回あたりの取得件数。
// 上限はレシート（親）の件数に効き、明細（子）は各レシートにまとめて付いてくる。
export const ANALYTICS_PAGE_SIZE = 1000;

type RawDetail = {
  price: number;
  tax_type: "inclusive" | "exclusive";
  category_id: number;
  breakdown_id: number | null;
  counterpart_id: number;
  owner_user_id: string | null;
  consumption_taxes: { multiplier: number } | { multiplier: number }[] | null;
};

type RawReceipt = {
  id: string;
  occurred_at: string;
  amount: number;
  payee_id: number | null;
  payer_user_id: string;
  transaction_types: { name: string } | { name: string }[] | null;
  receipt_details: RawDetail[] | null;
};

// 対象期間のレシートを、max_rowsの上限を超えても漏れなく取得するためページングで全件取得する。
async function fetchAllReceipts(
  supabase: SupabaseClient,
  groupId: string,
  from: Date,
  to: Date
): Promise<RawReceipt[]> {
  const receipts: RawReceipt[] = [];
  for (let start = 0; ; start += ANALYTICS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("receipts")
      .select(
        `id, occurred_at, amount, payee_id, payer_user_id, transaction_types(name),
         receipt_details(price, tax_type, category_id, breakdown_id, counterpart_id, owner_user_id,
           consumption_taxes(multiplier))`
      )
      .eq("group_id", groupId)
      .gte("occurred_at", from.toISOString())
      .lt("occurred_at", to.toISOString())
      // ページ間で行が重複・欠落しないよう、一意になる並び順で取得する
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + ANALYTICS_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }
    const page = (data ?? []) as unknown as RawReceipt[];
    receipts.push(...page);
    if (page.length < ANALYTICS_PAGE_SIZE) {
      return receipts;
    }
  }
}

// レシートを精算と同じロジックで明細に按分し、返金はマイナスにしたうえで
// 「月×カテゴリ×内訳×相手×支払い先×帰属先」ごとに合計する
// （docs/支出分析機能/詳細設計書.md 4.2節、docs/分析拡充/詳細設計書.md F4 2章）。
export function buildAnalyticsRows(receipts: RawReceipt[]): AnalyticsRow[] {
  const totals = new Map<string, AnalyticsRow>();

  for (const receipt of receipts) {
    const details = receipt.receipt_details ?? [];
    if (details.length === 0) continue;

    const allocated = allocateReceiptAmount({
      payerUserId: receipt.payer_user_id,
      amount: receipt.amount,
      isRefund: false, // 按分自体は支出・返金を区別しない（符号反転は下で行う）
      details: details.map((d) => ({
        price: d.price,
        taxType: d.tax_type,
        taxRateMultiplier: unwrapToOne(d.consumption_taxes)?.multiplier ?? null,
        ownerUserId: d.owner_user_id,
      })),
    });
    const sign = unwrapToOne(receipt.transaction_types)?.name === "返金" ? -1 : 1;
    const month = monthKeyOf(new Date(receipt.occurred_at));

    details.forEach((detail, index) => {
      const key = JSON.stringify([
        month,
        detail.category_id,
        detail.breakdown_id,
        detail.counterpart_id,
        receipt.payee_id,
        detail.owner_user_id,
      ]);
      const row = totals.get(key) ?? {
        month,
        categoryId: detail.category_id,
        breakdownId: detail.breakdown_id,
        counterpartId: detail.counterpart_id,
        payeeId: receipt.payee_id,
        ownerUserId: detail.owner_user_id,
        amount: 0,
      };
      row.amount += allocated[index] * sign;
      totals.set(key, row);
    });
  }

  return Array.from(totals.values());
}

// 支出分析画面を開いたときに一括で渡すデータを作る。
// 以降の画面操作（表示対象・月の切り替え）はこのデータだけでクライアント側で再集計する。
// currentUserId は支払い先の選択肢の見出し（自分用／相方の自分用）を決めるために使う。
export async function getAnalyticsData(
  supabase: SupabaseClient,
  groupId: string,
  currentUserId: string,
  now: Date = new Date()
): Promise<AnalyticsData> {
  const today = todayKey(now);
  const months = lastTwelveMonths(today);
  const { from, to } = monthRange(months);

  const membersPromise = getGroupMembers(supabase, groupId);
  const [receipts, members, categories, breakdowns, counterparts, payees] = await Promise.all([
    fetchAllReceipts(supabase, groupId, from, to),
    membersPromise,
    getCategoriesWithCostType(supabase, groupId),
    getCategoryBreakdowns(supabase, groupId),
    // 相手の名前はメンバーの表示名を使うため、メンバーを取得してから求める
    membersPromise.then((m) => getCounterpartNames(supabase, groupId, m)),
    getPayees(supabase, groupId),
  ]);
  const rows = buildAnalyticsRows(receipts);
  const usedPayeeIds = new Set(rows.map((r) => r.payeeId));

  return {
    today,
    months,
    categories: categories.map((c) => ({ id: c.id, name: c.name, costType: c.costType })),
    breakdowns: breakdowns.map((b) => ({ id: b.id, categoryId: b.categoryId, name: b.name })),
    counterparts,
    // 支払い先は登録済みの支払い先（相方の自分用を含む）を選択肢にする。非表示のものは12ヶ月で使われているときだけ
    payees: buildAnalyticsPayees(payees, currentUserId, members, (id) => usedPayeeIds.has(id)),
    members: members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      color: m.color,
    })),
    rows,
  };
}
