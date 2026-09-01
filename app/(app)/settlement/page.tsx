import { ConfirmSettlementButton } from "@/components/settlement/ConfirmSettlementButton";
import { ReopenSettlementButton } from "@/components/settlement/ReopenSettlementButton";
import { MonthSelector } from "@/components/ui/MonthSelector";
import { Tooltip } from "@/components/ui/Tooltip";
import { UserBadge } from "@/components/ui/UserBadge";
import {
  parseMonthParam,
  retentionMonthRange,
  toMonthParam,
} from "@/lib/receipts/queries";
import { getSettlementSummary } from "@/lib/settlement/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSignedYen(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "";
  return `${sign}${amount.toLocaleString()}円`;
}

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const targetDate = parseMonthParam(monthParam);
  const month = toMonthParam(targetDate);

  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const summary = await getSettlementSummary(supabase, membership!.groupId, targetDate);

  if (!summary) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold text-slate-900">精算</h1>
        <p className="text-sm text-slate-500">
          精算を計算するには、グループにメンバーが2人揃っている必要があります。
        </p>
      </div>
    );
  }

  const fromUser =
    summary.userA.userId === summary.settlementFromUserId
      ? summary.userA
      : summary.userB;
  const toUser =
    summary.userA.userId === summary.settlementToUserId
      ? summary.userA
      : summary.userB;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">精算</h1>
      <MonthSelector
        basePath="/settlement"
        month={month}
        minMonth={toMonthParam(retentionMonthRange().min)}
        maxMonth={toMonthParam(retentionMonthRange().max)}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2 font-normal"></th>
              <th className="pb-2 text-right font-normal">
                <UserBadge name={summary.userA.displayName} color={summary.userA.color} />
              </th>
              <th className="pb-2 text-right font-normal">
                <UserBadge name={summary.userB.displayName} color={summary.userB.color} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 text-slate-600">
                <span className="inline-flex items-center gap-1">
                  負担額
                  <Tooltip text="帰属先（共同/個人）に基づいて計算した、本来その人が負担すべき金額です。共同は2人で1/2ずつ、個人はその人に100%割り当てられます。" />
                </span>
              </td>
              <td className="py-2 text-right">
                {formatSignedYen(summary.userA.burden)}
              </td>
              <td className="py-2 text-right">
                {formatSignedYen(summary.userB.burden)}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-slate-600">
                <span className="inline-flex items-center gap-1">
                  実支払額
                  <Tooltip text="そのユーザーが実際にレシートで支払った金額の合計です。明細の帰属先には関係なく、レシート単位で支払者に全額計上されます。" />
                </span>
              </td>
              <td className="py-2 text-right">
                {summary.userA.paid.toLocaleString()}円
              </td>
              <td className="py-2 text-right">
                {summary.userB.paid.toLocaleString()}円
              </td>
            </tr>
            <tr>
              <td className="py-2 font-medium text-slate-900">
                <span className="inline-flex items-center gap-1">
                  精算差額
                  <Tooltip text="「実支払額－負担額」です。プラスは本来より多く支払っている（＝返してもらう側）、マイナスは本来より少なく支払っている（＝支払う側）ことを意味します。" />
                </span>
              </td>
              <td className="py-2 text-right font-medium text-slate-900">
                {formatSignedYen(summary.userA.diff)}
              </td>
              <td className="py-2 text-right font-medium text-slate-900">
                {formatSignedYen(summary.userB.diff)}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-3 text-xs text-slate-400">
          ※負担額は1円未満を四捨五入して表示しています（共同の支出を2人で割り切れない場合など）。2人の負担額の合計は、実支払額の合計と必ず一致します。
        </p>

        {(summary.userA.burden < 0 || summary.userB.burden < 0) && (
          <p className="mt-1 text-xs text-slate-500">
            ※負担額がマイナスになっているのは、返金などによりその人個人に帰属する支出がマイナスになったためです（返金分だけ、もう一方の実質的な負担が相対的に増えます）。
          </p>
        )}

        <p className="mt-4 flex flex-wrap items-center justify-center gap-1 rounded-lg bg-indigo-50 px-4 py-3 text-center text-sm font-medium text-indigo-700">
          {summary.settlementAmount === 0 ? (
            "精算の必要はありません"
          ) : (
            <>
              <UserBadge name={fromUser.displayName} color={fromUser.color} />
              は
              <UserBadge name={toUser.displayName} color={toUser.color} />
              に{summary.settlementAmount.toLocaleString()}円支払う
            </>
          )}
        </p>

        <div className="mt-6">
          {summary.isConfirmed ? (
            <div className="flex flex-col gap-3">
              <p className="text-center text-xs text-slate-500">
                確定日時：
                {summary.confirmedAt ? formatDateTime(summary.confirmedAt) : "-"}
              </p>
              <ReopenSettlementButton
                periodMonth={summary.periodMonth}
                isAdmin={membership!.role === "admin"}
              />
            </div>
          ) : (
            <ConfirmSettlementButton
              periodMonth={summary.periodMonth}
              isAdmin={membership!.role === "admin"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
