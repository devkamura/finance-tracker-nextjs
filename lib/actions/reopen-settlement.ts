"use server";

import { toPeriodMonthString } from "@/lib/receipts/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export type ReopenSettlementResult =
  | { success: true }
  | { success: false; error: string };

// 確定済みの月を再オープンする。管理者のみ実行可能
// （呼び出し側でも確認するが、最終的な保証はreopen_settlement RPC内のis_group_adminが担う）。
export async function reopenSettlement(
  targetDate: Date
): Promise<ReopenSettlementResult> {
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
    return { success: false, error: "管理者のみ再オープンできます。" };
  }

  const { error } = await supabase.rpc("reopen_settlement", {
    p_group_id: membership.groupId,
    p_period_month: toPeriodMonthString(targetDate),
  });

  if (error) {
    console.error("Failed to reopen settlement", error);
    return { success: false, error: "この月の精算は確定されていません。" };
  }

  return { success: true };
}
