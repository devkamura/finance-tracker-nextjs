import { BackToAnalyticsButton } from "@/components/receipt-list/BackToAnalyticsButton";
import { ReceiptAccordionItem } from "@/components/receipt-list/ReceiptAccordionItem";
import { formatYen } from "@/lib/analytics/aggregate";
import { lastTwelveMonths, monthRange, todayKey } from "@/lib/analytics/months";
import {
  buildSpecialExpenseListView,
  parseSpecialExpenseScope,
  specialExpenseDetailParams,
} from "@/lib/analytics/special-expense-list";
import { buildAnalyticsReturnHref, withQuery } from "@/lib/receipts/list-params";
import { listSpecialExpenseReceipts } from "@/lib/receipts/queries";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// "2026-09" → "2026年9月"
function monthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

// 直近12ヶ月の特別費の一覧（Issue #41 要件10。docs/仕様書/#41_…/詳細設計書.md 6.6節）。
// 分析画面の「直近12ヶ月の特別費」を押したときに開く。期間は分析画面と同じ当月を含む12ヶ月で、
// 特別費の明細を含むレシートだけを DB で絞り込んで読む（12ヶ月分のレシートをすべて読み直さない）。
// 金額は表示対象（全体・メンバー＋共同1/2）に合わせた按分後の金額で、合計は分析画面の金額と一致する。
export default async function SpecialExpensesPage({
  searchParams,
}: {
  // scope・joint（表示対象）と ret（「← 分析に戻る」で開く分析画面の状態）を受け取る
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);
  const groupId = membership!.groupId;

  const months = lastTwelveMonths(todayKey(new Date()));
  const [receipts, members] = await Promise.all([
    listSpecialExpenseReceipts(supabase, groupId, monthRange(months)),
    getGroupMembers(supabase, groupId),
  ]);

  const scope = parseSpecialExpenseScope(params, members);
  const scopeMember =
    scope.kind === "user" ? members.find((m) => m.userId === scope.userId) : undefined;
  const scopeLabel = scopeMember
    ? `${scopeMember.displayName}${scope.kind === "user" && scope.includeJoint ? "＋共同1/2" : ""}`
    : "全体";
  const view = buildSpecialExpenseListView(receipts, scope);
  // 詳細 → 編集 → 詳細と移っても、詳細の「戻る」でこの一覧に戻れるよう引き継ぐ
  const detailParams = specialExpenseDetailParams(params);
  const ret = typeof params.ret === "string" ? params.ret : null;

  return (
    <div className="flex flex-col gap-4">
      <BackToAnalyticsButton href={buildAnalyticsReturnHref(ret)} />
      <h1 className="text-xl font-bold text-slate-900">直近12ヶ月の特別費</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
        <p className="text-xs text-slate-500">
          {monthLabel(months[0])}〜{monthLabel(months[months.length - 1])}　表示対象：{scopeLabel}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          合計{" "}
          <span className="text-2xl font-bold text-slate-900">{formatYen(view.total)}</span>
        </p>
      </div>

      {view.months.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          直近12ヶ月の特別費はありません。
        </p>
      ) : (
        view.months.map((group) => (
          <section key={group.month} className="flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between px-1 text-sm font-semibold text-slate-700">
              <span>{monthLabel(group.month)}</span>
              <span className="text-slate-900">{formatYen(group.total)}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {group.items.map(({ receipt, match }) => (
                <ReceiptAccordionItem
                  key={receipt.id}
                  receipt={receipt}
                  detailHref={withQuery(`/receipts/${receipt.id}`, detailParams)}
                  initiallyOpen={false}
                  // 特別費の明細を強調し、「うち 特別費 〇〇円」を出す（通常の明細が混ざるレシートがあるため）
                  match={{ label: "特別費", amount: match.matchedAmount, itemIds: match.matchedItemIds }}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
