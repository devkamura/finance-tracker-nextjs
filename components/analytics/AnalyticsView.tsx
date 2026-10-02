"use client";

import { useEffect, useMemo, useState } from "react";

import { AnalyticsMonthSelect } from "@/components/analytics/AnalyticsMonthSelect";
import { CategoryBreakdownTable } from "@/components/analytics/CategoryBreakdownTable";
import { CategoryPieChart } from "@/components/analytics/CategoryPieChart";
import { NegativeAmountNotice } from "@/components/analytics/NegativeAmountNotice";
import { ScopeSelector } from "@/components/analytics/ScopeSelector";
import { buildPieData, formatYen, sumByCategory } from "@/lib/analytics/aggregate";
import type { AnalyticsData, Scope } from "@/lib/analytics/types";

type AnalyticsViewProps = {
  data: AnalyticsData;
  initialScopeUserId: string | null; // null＝全体
  initialIncludeJoint: boolean;
  initialMonth: string;
};

// 分析画面の状態（表示対象・共同トグル・月）を管理し、サーバーから受け取った
// データをその場で再集計して描画する。切り替えでサーバー通信は発生しない。
export function AnalyticsView({
  data,
  initialScopeUserId,
  initialIncludeJoint,
  initialMonth,
}: AnalyticsViewProps) {
  const [scopeUserId, setScopeUserId] = useState<string | null>(initialScopeUserId);
  const [includeJoint, setIncludeJoint] = useState(initialIncludeJoint);
  const [month, setMonth] = useState(initialMonth);

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
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [scopeUserId, includeJoint, month]);

  const changeScope = (userId: string | null) => {
    setScopeUserId(userId);
    if (userId === null) {
      // 全体に戻したら共同トグルは隠れるため、オフに戻す
      setIncludeJoint(false);
    }
  };

  const nameOf = (categoryId: number) =>
    data.categories.find((c) => c.id === categoryId)?.name ?? "不明";

  return (
    <div className="flex flex-col gap-4">
      <ScopeSelector
        members={data.members}
        scopeUserId={scopeUserId}
        includeJoint={includeJoint}
        onChangeScope={changeScope}
        onChangeIncludeJoint={setIncludeJoint}
      />
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
              negatives={pieData.negatives.map((c) => ({
                name: nameOf(c.categoryId),
                amount: c.amount,
              }))}
              hasPie={pieData.slices.length > 0}
              positiveTotal={pieData.positiveTotal}
              total={pieData.total}
            />
            <CategoryBreakdownTable pieData={pieData} categories={data.categories} />
          </div>
        )}
      </div>
    </div>
  );
}
