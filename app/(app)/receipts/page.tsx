import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

import { BackToAnalyticsButton } from "@/components/receipt-list/BackToAnalyticsButton";
import { ReceiptListView } from "@/components/receipt-list/ReceiptListView";
import {
  buildAnalyticsReturnHref,
  parseDrilldownSource,
  pickListParams,
} from "@/lib/receipts/list-params";
import {
  listReceipts,
  monthPeriod,
  parseMonthParam,
  retentionMonthRange,
  toMonthParam,
} from "@/lib/receipts/queries";
import {
  getCategoriesWithCostType,
  getCategoryBreakdowns,
  getCounterpartNames,
} from "@/lib/settings/queries";
import { isMonthConfirmed } from "@/lib/settlement/queries";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export default async function ReceiptsPage({
  searchParams,
}: {
  // month・sort・open に加え、分析画面からの絞り込み条件
  // （category・breakdown・costType・payee・counterpart・scope・joint・from）を受け取る
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const monthParam = typeof params.month === "string" ? params.month : undefined;
  const targetDate = parseMonthParam(monthParam);
  const month = toMonthParam(targetDate);

  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  // その月のレシートは絞り込み・並び順に関係なくすべて取得して画面に渡す。
  // 絞り込み・解除・並び替えは画面側（ReceiptListView）だけで行う（詳細設計書 フェーズ3 5章）。
  const period = monthPeriod(targetDate);
  const groupId = membership!.groupId;
  const membersPromise = getGroupMembers(supabase, groupId);
  const [receipts, confirmed, members, categories, breakdowns, counterparts] = await Promise.all([
    listReceipts(supabase, groupId, period),
    isMonthConfirmed(supabase, groupId, targetDate),
    membersPromise,
    // 絞り込みの条件の名前・費用区分の判定に使う（分析画面と同じデータ。docs/分析拡充/詳細設計書.md F4 4章）
    getCategoriesWithCostType(supabase, groupId),
    getCategoryBreakdowns(supabase, groupId),
    membersPromise.then((m) => getCounterpartNames(supabase, groupId, m)),
  ]);
  const { min, max } = retentionMonthRange();

  return (
    <div className="flex flex-col gap-4">
      {parseDrilldownSource(params) === "analytics" && (
        <BackToAnalyticsButton
          href={buildAnalyticsReturnHref(typeof params.ret === "string" ? params.ret : null)}
        />
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">レシート一覧</h1>
        <Link
          href="/"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          + 新しいレシートを登録
        </Link>
      </div>

      <ReceiptListView
        // 同じページへの移動（ヘッダーの「一覧」や月の切り替え）で部品が使い回されると、
        // 画面側で持っている絞り込み・並び順が残ってしまう。サーバーが受け取ったURLの条件が
        // 変わったときは作り直し、新しいURLから状態を読み直す。
        key={pickListParams(params).toString()}
        receipts={receipts}
        master={{
          categories,
          breakdowns: breakdowns.map((b) => ({ id: b.id, categoryId: b.categoryId, name: b.name })),
          counterparts,
        }}
        members={members.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
        month={month}
        minMonth={toMonthParam(min)}
        maxMonth={toMonthParam(max)}
        confirmed={confirmed}
      />

      {/* 一覧が長くなりページ上部までスクロールしなくても登録できるよう、
          常に画面に表示される位置に固定する。 */}
      <Link
        href="/"
        aria-label="新しいレシートを登録"
        className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700"
      >
        <FontAwesomeIcon icon={faPlus} />
        レシートを登録
      </Link>
    </div>
  );
}
