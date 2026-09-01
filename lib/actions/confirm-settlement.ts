"use server";

import { toPeriodMonthString } from "@/lib/receipts/queries";
import { getSettlementSummary } from "@/lib/settlement/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export type ConfirmSettlementResult =
  | { success: true }
  | { success: false; error: string };

export async function confirmSettlement(
  targetDate: Date
): Promise<ConfirmSettlementResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) {
    return { success: false, error: "グループに所属していません。" };
  }
  if (membership.role !== "admin") {
    return { success: false, error: "管理者のみ精算を確定できます。" };
  }

  const summary = await getSettlementSummary(
    supabase,
    membership.groupId,
    targetDate
  );
  if (!summary) {
    return { success: false, error: "精算対象のメンバーが揃っていません。" };
  }
  if (summary.isConfirmed) {
    return { success: false, error: "この月の精算は既に確定済みです。" };
  }

  const { error } = await supabase.rpc("confirm_settlement", {
    p_group_id: membership.groupId,
    p_period_month: toPeriodMonthString(targetDate),
    p_user_a_id: summary.userA.userId,
    p_user_b_id: summary.userB.userId,
    p_user_a_burden: summary.userA.burden,
    p_user_b_burden: summary.userB.burden,
    p_user_a_paid: summary.userA.paid,
    p_user_b_paid: summary.userB.paid,
    p_settlement_amount: summary.settlementAmount,
    p_settlement_from_user_id: summary.settlementFromUserId,
    p_settlement_to_user_id: summary.settlementToUserId,
  });

  if (error) {
    console.error("Failed to confirm settlement", error);
    return { success: false, error: "精算の確定に失敗しました。" };
  }

  return { success: true };
}
