import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { monthPeriod, toPeriodMonthString, type Period } from "@/lib/receipts/queries";
import {
  calculateSettlement,
  type SettlementReceiptInput,
} from "@/lib/settlement/calculate";
import { getGroupMembers } from "@/lib/supabase/group";
import { unwrapToOne } from "@/lib/supabase/unwrap";
import type { SettlementSummaryView } from "@/types/receipt";

// 対象月が精算確定済み(status='confirmed')かどうかだけを軽量に判定する。
// レシート一覧画面で「確定済み」表示を出すために使う
// （getSettlementSummaryはレシート・メンバー等も取得するため、ここでは使わない）。
export async function isMonthConfirmed(
  supabase: SupabaseClient,
  groupId: string,
  targetDate: Date = new Date()
): Promise<boolean> {
  const periodMonth = toPeriodMonthString(targetDate);
  const { data } = await supabase
    .from("settlement_periods")
    .select("status")
    .eq("group_id", groupId)
    .eq("period_month", periodMonth)
    .maybeSingle();
  return data?.status === "confirmed";
}

type RawDetail = {
  price: number;
  tax_type: "inclusive" | "exclusive";
  owner_user_id: string | null;
  consumption_taxes: { multiplier: number } | { multiplier: number }[] | null;
};

async function fetchReceiptsForCalc(
  supabase: SupabaseClient,
  groupId: string,
  period: Period
): Promise<SettlementReceiptInput[]> {
  const { data, error } = await supabase
    .from("receipts")
    .select(
      `payer_user_id, amount, transaction_types(name),
       receipt_details(price, tax_type, owner_user_id, consumption_taxes(multiplier))`
    )
    .eq("group_id", groupId)
    .gte("occurred_at", period.from.toISOString())
    .lt("occurred_at", period.to.toISOString());

  if (error || !data) {
    console.error("Failed to fetch receipts for settlement", error);
    return [];
  }

  return data.map((row) => ({
    payerUserId: row.payer_user_id,
    amount: row.amount,
    isRefund: unwrapToOne(row.transaction_types)?.name === "返金",
    details: (
      (row.receipt_details ?? []) as unknown as RawDetail[]
    ).map((d) => ({
      price: d.price,
      taxType: d.tax_type,
      taxRateMultiplier: unwrapToOne(d.consumption_taxes)?.multiplier ?? null,
      ownerUserId: d.owner_user_id,
    })),
  }));
}

// 対象月の精算サマリーを返す。settlement_periodsが確定済み(status='confirmed')なら
// そのスナップショット値を、それ以外は都度計算した最新値を返す（docs/basic-design.md 5章）。
export async function getSettlementSummary(
  supabase: SupabaseClient,
  groupId: string,
  targetDate: Date = new Date()
): Promise<SettlementSummaryView | null> {
  const period = monthPeriod(targetDate);
  const periodMonth = toPeriodMonthString(targetDate);

  const members = await getGroupMembers(supabase, groupId);
  if (members.length !== 2) {
    // グループにメンバーが2人揃っていない場合、精算は算出できない。
    return null;
  }
  const [userA, userB] = members;

  const { data: settlementRow } = await supabase
    .from("settlement_periods")
    .select("*")
    .eq("group_id", groupId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (settlementRow && settlementRow.status === "confirmed") {
    return {
      periodMonth,
      isConfirmed: true,
      userA: {
        userId: settlementRow.user_a_id,
        displayName:
          members.find((m) => m.userId === settlementRow.user_a_id)
            ?.displayName ?? "unknown",
        color:
          members.find((m) => m.userId === settlementRow.user_a_id)?.color ??
          null,
        burden: settlementRow.user_a_burden,
        paid: settlementRow.user_a_paid,
        diff: settlementRow.user_a_paid - settlementRow.user_a_burden,
      },
      userB: {
        userId: settlementRow.user_b_id,
        displayName:
          members.find((m) => m.userId === settlementRow.user_b_id)
            ?.displayName ?? "unknown",
        color:
          members.find((m) => m.userId === settlementRow.user_b_id)?.color ??
          null,
        burden: settlementRow.user_b_burden,
        paid: settlementRow.user_b_paid,
        diff: settlementRow.user_b_paid - settlementRow.user_b_burden,
      },
      settlementFromUserId: settlementRow.settlement_from_user_id,
      settlementToUserId: settlementRow.settlement_to_user_id,
      settlementAmount: settlementRow.settlement_amount,
      confirmedAt: settlementRow.confirmed_at,
      reopenedAt: settlementRow.reopened_at,
    };
  }

  const receipts = await fetchReceiptsForCalc(supabase, groupId, period);
  const result = calculateSettlement(receipts, userA.userId, userB.userId);

  return {
    periodMonth,
    isConfirmed: false,
    userA: {
      userId: userA.userId,
      displayName: userA.displayName,
      color: userA.color,
      burden: result.burden[userA.userId],
      paid: result.paid[userA.userId],
      diff: result.diff[userA.userId],
    },
    userB: {
      userId: userB.userId,
      displayName: userB.displayName,
      color: userB.color,
      burden: result.burden[userB.userId],
      paid: result.paid[userB.userId],
      diff: result.diff[userB.userId],
    },
    settlementFromUserId: result.settlement.fromUserId,
    settlementToUserId: result.settlement.toUserId,
    settlementAmount: result.settlement.amount,
    confirmedAt: settlementRow?.confirmed_at ?? null,
    reopenedAt: settlementRow?.reopened_at ?? null,
  };
}
