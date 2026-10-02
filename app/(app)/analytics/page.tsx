import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 支出分析画面（docs/支出分析機能/詳細設計書.md 6章）。
// 画面を開いたときに12ヶ月分の集計用データを一括で取得し、以降の表示対象・月の切り替えは
// クライアント側だけで処理する（サーバー通信なし）。
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    joint?: string;
    month?: string;
    chart?: string;
    category?: string;
  }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const data = await getAnalyticsData(supabase, membership!.groupId);

  // URLの初期状態を検証する。不正な値は初期値（全体・共同オフ・当月・円グラフ・総支出）に戻す。
  const scopeUserId = data.members.some((m) => m.userId === params.scope)
    ? params.scope!
    : null;
  const initialMonth =
    params.month && data.months.includes(params.month)
      ? params.month
      : data.months[data.months.length - 1];
  const initialChart = params.chart === "trend" ? "trend" : "pie";
  const initialCategoryId =
    data.categories.find((c) => String(c.id) === params.category)?.id ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">分析</h1>
      <AnalyticsView
        data={data}
        initialScopeUserId={scopeUserId}
        initialIncludeJoint={scopeUserId !== null && params.joint === "1"}
        initialMonth={initialMonth}
        initialChart={initialChart}
        initialCategoryId={initialCategoryId}
      />
    </div>
  );
}
