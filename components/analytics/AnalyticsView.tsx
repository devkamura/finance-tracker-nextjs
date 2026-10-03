"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

import { AnalyticsMonthSelect } from "@/components/analytics/AnalyticsMonthSelect";
import { CategoryBreakdownTable } from "@/components/analytics/CategoryBreakdownTable";
import { CategoryPieChart } from "@/components/analytics/CategoryPieChart";
import { ChartTypeTabs } from "@/components/analytics/ChartTypeTabs";
import { NegativeAmountNotice } from "@/components/analytics/NegativeAmountNotice";
import { ScopeSelector } from "@/components/analytics/ScopeSelector";
import { TrendCategorySelect } from "@/components/analytics/TrendCategorySelect";
import { TrendComposedChart } from "@/components/analytics/TrendComposedChart";
import { TrendSelectedMonth } from "@/components/analytics/TrendSelectedMonth";
import {
  buildPieData,
  buildTrendData,
  formatYen,
  sumByCategory,
  sumByMonth,
} from "@/lib/analytics/aggregate";
import { categoryColor } from "@/lib/analytics/category-colors";
import type { AnalyticsData, Scope } from "@/lib/analytics/types";
import {
  parseAnalyticsState,
  serializeAnalyticsState,
  type AnalyticsState,
} from "@/lib/analytics/url-state";
import { buildFilteredListHref } from "@/lib/receipts/list-params";

// 総支出の棒の色（カテゴリの色と区別するためグレー。詳細設計書 フェーズ2 確認事項3）
const TOTAL_BAR_COLOR = "#94a3b8";

type AnalyticsViewProps = {
  data: AnalyticsData;
};

// "2026-09" → "2026年9月"
function monthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

// 分析画面の状態（表示対象・共同トグル・グラフ種類・月・カテゴリ）を管理し、サーバーから
// 受け取ったデータをその場で再集計して描画する。切り替えでサーバー通信は発生しない。
export function AnalyticsView({ data }: AnalyticsViewProps) {
  const searchParams = useSearchParams();
  // 初期状態は現在のURLから読む。レシート一覧からブラウザの「戻る」で戻ったとき、
  // ページはキャッシュから再利用されるが部品は作り直されるため、URLに保存しておいた
  // 状態（replaceStateで書き込んだもの）から復元する（詳細設計書 フェーズ3 4章）。
  const [state, setState] = useState<AnalyticsState>(() =>
    parseAnalyticsState((key) => searchParams.get(key), data)
  );
  const update = (patch: Partial<AnalyticsState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const { scopeUserId, includeJoint, month, chart, categoryId, trendMonth } = state;

  const scope: Scope = useMemo(
    () =>
      scopeUserId === null
        ? { kind: "all" }
        : { kind: "user", userId: scopeUserId, includeJoint },
    [scopeUserId, includeJoint]
  );

  const pieData = useMemo(
    () => buildPieData(sumByCategory(data.rows, scope, month)),
    [data.rows, scope, month]
  );

  const trendData = useMemo(
    () => buildTrendData(sumByMonth(data.rows, scope, data.months, categoryId)),
    [data.rows, data.months, scope, categoryId]
  );

  // 選択状態をURLに反映する（再読み込み・一覧から戻ったときの復元用）。
  // replaceStateはNext.jsのルーターと連携しつつページの再取得を起こさない。
  // 切り替えのたびに履歴が増えて「戻る」が操作の巻き戻しになるのを避けるため、
  // pushStateではなくreplaceStateを使う（詳細設計書6.2節）。
  useEffect(() => {
    window.history.replaceState(null, "", `?${serializeAnalyticsState(state).toString()}`);
  }, [state]);

  const changeScope = (userId: string | null) => {
    // 全体に戻したら共同トグルは隠れるため、オフに戻す
    update(userId === null ? { scopeUserId: null, includeJoint: false } : { scopeUserId: userId });
  };

  const nameOf = (id: number) => data.categories.find((c) => c.id === id)?.name ?? "不明";

  const firstMonth = data.months[0];
  const lastMonth = data.months[data.months.length - 1];
  const selectedPoint = trendData.points.find((p) => p.month === trendMonth) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <ScopeSelector
        members={data.members}
        scopeUserId={scopeUserId}
        includeJoint={includeJoint}
        onChangeScope={changeScope}
        onChangeIncludeJoint={(value) => update({ includeJoint: value })}
      />
      <ChartTypeTabs value={chart} onChange={(value) => update({ chart: value })} />

      {chart === "pie" ? (
        <>
          <AnalyticsMonthSelect
            months={data.months}
            month={month}
            onChange={(value) => update({ month: value })}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            {pieData.slices.length === 0 &&
            pieData.negatives.length === 0 &&
            pieData.zeroCategories.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                この月の支出はありません。
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {pieData.slices.length > 0 && (
                  <CategoryPieChart slices={pieData.slices} categories={data.categories} />
                )}
                <p className="text-center text-sm text-slate-600">
                  合計{" "}
                  <span className="text-lg font-bold text-slate-900">
                    {formatYen(pieData.total)}
                  </span>
                </p>
                <NegativeAmountNotice
                  subject="カテゴリ"
                  negatives={pieData.negatives.map((c) => ({
                    name: nameOf(c.categoryId),
                    amount: c.amount,
                  }))}
                  ratio={
                    pieData.slices.length > 0
                      ? { positiveTotal: pieData.positiveTotal, total: pieData.total }
                      : undefined
                  }
                />
                <CategoryBreakdownTable
                  pieData={pieData}
                  categories={data.categories}
                  // 行をタップすると、この月×カテゴリ×表示対象で絞り込んだレシート一覧へ移動する
                  hrefFor={(id) =>
                    buildFilteredListHref({ month, categoryId: id, scope, from: "analytics" })
                  }
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <TrendCategorySelect
            categories={data.categories}
            categoryId={categoryId}
            onChange={(value) => update({ categoryId: value })}
          />
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <TrendComposedChart
              points={trendData.points}
              barColor={
                categoryId === null
                  ? TOTAL_BAR_COLOR
                  : categoryColor(categoryId, data.categories)
              }
              selectedMonth={trendMonth}
              onSelectMonth={(value) => update({ trendMonth: value })}
            />
            <p className="text-center text-xs text-slate-500">
              {monthLabel(firstMonth)}〜{monthLabel(lastMonth)}　棒：金額（左軸）／線：前月比（右軸）
            </p>
            <TrendSelectedMonth
              point={selectedPoint}
              monthLabel={selectedPoint ? monthLabel(selectedPoint.month) : ""}
              href={
                selectedPoint
                  ? buildFilteredListHref({
                      month: selectedPoint.month,
                      categoryId,
                      scope,
                      from: "analytics",
                    })
                  : null
              }
            />
            {/* 常に出すと画面が長くなるため、補足の注記は折りたたんでおき、押したときだけ表示する。
                返金でマイナスになった月の注意書き（必須）は折りたたまずに常に表示する。 */}
            <details className="group text-xs text-slate-500">
              <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="h-2.5 w-2.5 transition-transform group-open:rotate-90"
                />
                ※注意事項
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3.5">
                <li>
                  ※ {monthLabel(lastMonth)}
                  は月の途中の金額です。前月比も途中までの金額で計算しています。
                </li>
                <li>
                  ※ {monthLabel(firstMonth)}
                  は前月のデータがないため、前月比を表示していません。前月が0円以下の月、返金が支出を上回った月も前月比を表示していません。
                </li>
              </ul>
            </details>
            <NegativeAmountNotice
              subject="月"
              negatives={trendData.negatives.map((p) => ({
                name: monthLabel(p.month),
                amount: p.amount,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
