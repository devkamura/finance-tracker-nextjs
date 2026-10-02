"use client";

import { useEffect, useMemo, useState } from "react";

import { AnalyticsMonthSelect } from "@/components/analytics/AnalyticsMonthSelect";
import { CategoryBreakdownTable } from "@/components/analytics/CategoryBreakdownTable";
import { CategoryPieChart } from "@/components/analytics/CategoryPieChart";
import { ChartTypeTabs, type ChartType } from "@/components/analytics/ChartTypeTabs";
import { NegativeAmountNotice } from "@/components/analytics/NegativeAmountNotice";
import { ScopeSelector } from "@/components/analytics/ScopeSelector";
import { TrendCategorySelect } from "@/components/analytics/TrendCategorySelect";
import { TrendComposedChart } from "@/components/analytics/TrendComposedChart";
import {
  buildPieData,
  buildTrendData,
  formatYen,
  sumByCategory,
  sumByMonth,
} from "@/lib/analytics/aggregate";
import { categoryColor } from "@/lib/analytics/category-colors";
import type { AnalyticsData, Scope } from "@/lib/analytics/types";

// 総支出の棒の色（カテゴリの色と区別するためグレー。詳細設計書 フェーズ2 確認事項3）
const TOTAL_BAR_COLOR = "#94a3b8";

type AnalyticsViewProps = {
  data: AnalyticsData;
  initialScopeUserId: string | null; // null＝全体
  initialIncludeJoint: boolean;
  initialMonth: string;
  initialChart: ChartType;
  initialCategoryId: number | null; // null＝総支出
};

// "2026-09" → "2026年9月"
function monthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

// 分析画面の状態（表示対象・共同トグル・グラフ種類・月・カテゴリ）を管理し、サーバーから
// 受け取ったデータをその場で再集計して描画する。切り替えでサーバー通信は発生しない。
export function AnalyticsView({
  data,
  initialScopeUserId,
  initialIncludeJoint,
  initialMonth,
  initialChart,
  initialCategoryId,
}: AnalyticsViewProps) {
  const [scopeUserId, setScopeUserId] = useState<string | null>(initialScopeUserId);
  const [includeJoint, setIncludeJoint] = useState(initialIncludeJoint);
  const [chart, setChart] = useState<ChartType>(initialChart);
  const [month, setMonth] = useState(initialMonth);
  const [categoryId, setCategoryId] = useState<number | null>(initialCategoryId);

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
    const params = new URLSearchParams();
    params.set("scope", scopeUserId ?? "all");
    if (scopeUserId !== null && includeJoint) {
      params.set("joint", "1");
    }
    params.set("month", month);
    params.set("chart", chart);
    params.set("category", categoryId === null ? "total" : String(categoryId));
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [scopeUserId, includeJoint, month, chart, categoryId]);

  const changeScope = (userId: string | null) => {
    setScopeUserId(userId);
    if (userId === null) {
      // 全体に戻したら共同トグルは隠れるため、オフに戻す
      setIncludeJoint(false);
    }
  };

  const nameOf = (id: number) => data.categories.find((c) => c.id === id)?.name ?? "不明";

  const firstMonth = data.months[0];
  const lastMonth = data.months[data.months.length - 1];

  return (
    <div className="flex flex-col gap-4">
      <ScopeSelector
        members={data.members}
        scopeUserId={scopeUserId}
        includeJoint={includeJoint}
        onChangeScope={changeScope}
        onChangeIncludeJoint={setIncludeJoint}
      />
      <ChartTypeTabs value={chart} onChange={setChart} />

      {chart === "pie" ? (
        <>
          <AnalyticsMonthSelect months={data.months} month={month} onChange={setMonth} />
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
                <CategoryBreakdownTable pieData={pieData} categories={data.categories} />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <TrendCategorySelect
            categories={data.categories}
            categoryId={categoryId}
            onChange={setCategoryId}
          />
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <TrendComposedChart
              points={trendData.points}
              barColor={
                categoryId === null
                  ? TOTAL_BAR_COLOR
                  : categoryColor(categoryId, data.categories)
              }
            />
            <p className="text-center text-xs text-slate-500">
              {monthLabel(firstMonth)}〜{monthLabel(lastMonth)}　棒：金額（左軸）／線：前月比（右軸）
            </p>
            <ul className="flex flex-col gap-0.5 text-xs text-slate-500">
              <li>
                ※ {monthLabel(lastMonth)}
                は月の途中の金額です。前月比も途中までの金額で計算しています。
              </li>
              <li>
                ※ {monthLabel(firstMonth)}
                は前月のデータがないため、前月比を表示していません。前月が0円以下の月、返金が支出を上回った月も前月比を表示していません。
              </li>
            </ul>
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
