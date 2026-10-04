import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

// 支出分析画面（docs/支出分析機能/詳細設計書.md 6章）。
// 画面を開いたときに12ヶ月分の集計用データを一括で取得し、以降の表示対象・月の切り替えは
// クライアント側だけで処理する（サーバー通信なし）。
// 画面の状態（表示対象・月など）はURLに保持し、AnalyticsViewが現在のURLから読み取る
// （レシート一覧から「戻る」で戻ったときに状態を復元するため。詳細設計書 フェーズ3 4章）。
export default async function AnalyticsPage() {
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const data = await getAnalyticsData(supabase, membership!.groupId, user!.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">分析</h1>
      <AnalyticsView data={data} />
    </div>
  );
}
