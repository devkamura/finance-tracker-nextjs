"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

import { AnalyticsConditionsPanel } from "@/components/analytics/AnalyticsConditionsPanel";
import { AnalyticsMonthSelect } from "@/components/analytics/AnalyticsMonthSelect";
import { ChartTypeTabs } from "@/components/analytics/ChartTypeTabs";
import { NegativeAmountNotice } from "@/components/analytics/NegativeAmountNotice";
import { ScopeSelector } from "@/components/analytics/ScopeSelector";
import { SplitBreakdownTable } from "@/components/analytics/SplitBreakdownTable";
import { SplitFilterControls } from "@/components/analytics/SplitFilterControls";
import { SplitPieChart } from "@/components/analytics/SplitPieChart";
import { TrendComposedChart } from "@/components/analytics/TrendComposedChart";
import { TrendSelectedMonth } from "@/components/analytics/TrendSelectedMonth";
import {
  buildPieData,
  buildTrendData,
  formatYen,
  sumByDimension,
  sumByMonth,
} from "@/lib/analytics/aggregate";
import {
  conditionsLabel,
  costTypeMap,
  DIMENSION_LABELS,
  keyColor,
  keyLabel,
} from "@/lib/analytics/dimensions";
import type { AnalyticsData, Scope } from "@/lib/analytics/types";
import {
  filterConditions,
  parseAnalyticsState,
  serializeAnalyticsState,
  type AnalyticsState,
} from "@/lib/analytics/url-state";
import { replaceUrlKeepingAppState } from "@/lib/navigation/history-state";
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

// 分析画面の状態（表示対象・共同トグル・グラフ種類・月・分ける・絞り込み）を管理し、サーバーから
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

  const { scopeUserId, includeJoint, month, chart, split, filter, trendMonth } = state;

  const scope: Scope = useMemo(
    () =>
      scopeUserId === null
        ? { kind: "all" }
        : { kind: "user", userId: scopeUserId, includeJoint },
    [scopeUserId, includeJoint]
  );

  const costTypes = useMemo(() => costTypeMap(data.categories), [data.categories]);
  // 絞り込みの条件（円グラフ・推移グラフ・一覧へのリンクで共通）
  const conditions = useMemo(() => filterConditions(filter), [filter]);

  const pieData = useMemo(
    () =>
      buildPieData(sumByDimension(data.rows, scope, month, split, conditions, costTypes)),
    [data.rows, scope, month, split, conditions, costTypes]
  );

  const trendData = useMemo(
    () => buildTrendData(sumByMonth(data.rows, scope, data.months, conditions, costTypes)),
    [data.rows, data.months, scope, conditions, costTypes]
  );

  // 選択状態をURLに反映する（再読み込み・一覧から戻ったときの復元用）。
  // replaceStateはNext.jsのルーターと連携しつつページの再取得を起こさない。
  // 切り替えのたびに履歴が増えて「戻る」が操作の巻き戻しになるのを避けるため、
  // pushStateではなくreplaceStateを使う（詳細設計書6.2節）。
  useEffect(() => {
    // 直前の画面の記録（共通の戻るボタン用）を消さないよう、共通の処理で書き換える
    replaceUrlKeepingAppState(`?${serializeAnalyticsState(state).toString()}`);
  }, [state]);

  const changeScope = (userId: string | null) => {
    // 全体に戻したら共同トグルは隠れるため、オフに戻す
    update(userId === null ? { scopeUserId: null, includeJoint: false } : { scopeUserId: userId });
  };

  // 「分ける」項目の値の表示名と色。内訳はカテゴリで絞り込んでいるときだけカテゴリ名を省く
  const labelOf = (key: string) =>
    keyLabel(split, key, data, { withCategory: filter?.dimension !== "category" });
  const colorOf = (key: string) => keyColor(split, key, data);
  // 絞り込み中は合計の名前を「食費の合計」のように変える（基本設計書 2.9節）
  const filterLabel = conditionsLabel(conditions, data);

  // 条件の折りたたみを閉じているときに出す、今の条件（表示対象 ／ 絞り込み ／ 分ける）
  const scopeMember = data.members.find((m) => m.userId === scopeUserId);
  const conditionsSummary = [
    scopeMember ? `${scopeMember.displayName}${includeJoint ? "＋共同1/2" : ""}` : "全体",
    filterLabel ?? "絞り込みなし",
    ...(chart === "pie" ? [`${DIMENSION_LABELS[split]}で分ける`] : []),
  ].join(" ／ ");

  const firstMonth = data.months[0];
  const lastMonth = data.months[data.months.length - 1];
  const selectedPoint = trendData.points.find((p) => p.month === trendMonth) ?? null;
  // 一覧の「← 分析に戻る」で、タップしたときの状態の分析画面を開けるよう、今の状態を持たせる
  const returnState = serializeAnalyticsState(state);

  return (
    <div className="flex flex-col gap-4">
      <ChartTypeTabs value={chart} onChange={(value) => update({ chart: value })} />
      <AnalyticsConditionsPanel summary={conditionsSummary}>
        <div className="flex items-start gap-2 text-sm text-slate-600">
          <span className="w-20 shrink-0 pt-1">表示対象</span>
          <div className="min-w-0 flex-1">
            <ScopeSelector
              members={data.members}
              scopeUserId={scopeUserId}
              includeJoint={includeJoint}
              onChangeScope={changeScope}
              onChangeIncludeJoint={(value) => update({ includeJoint: value })}
            />
          </div>
        </div>
        <SplitFilterControls
          master={data}
          split={chart === "pie" ? split : null}
          onChangeSplit={(value) => update({ split: value })}
          filter={filter}
          onChangeFilter={(value) => update({ filter: value })}
        />
      </AnalyticsConditionsPanel>

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
            pieData.zeroKeys.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {filterLabel
                  ? `この月の${filterLabel}の支出はありません。`
                  : "この月の支出はありません。"}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {pieData.slices.length > 0 && (
                  <SplitPieChart slices={pieData.slices} labelOf={labelOf} colorOf={colorOf} />
                )}
                <p className="text-center text-sm text-slate-600">
                  {filterLabel ? `${filterLabel}の合計` : "合計"}{" "}
                  <span className="text-lg font-bold text-slate-900">
                    {formatYen(pieData.total)}
                  </span>
                </p>
                <NegativeAmountNotice
                  subject={DIMENSION_LABELS[split]}
                  negatives={pieData.negatives.map((c) => ({
                    name: labelOf(c.key),
                    amount: c.amount,
                  }))}
                  ratio={
                    pieData.slices.length > 0
                      ? { positiveTotal: pieData.positiveTotal, total: pieData.total }
                      : undefined
                  }
                />
                <SplitBreakdownTable
                  pieData={pieData}
                  subject={DIMENSION_LABELS[split]}
                  labelOf={labelOf}
                  colorOf={colorOf}
                  // 行をタップすると、この月×絞り込み×行の値×表示対象で絞り込んだレシート一覧へ移動する
                  hrefFor={(key) =>
                    buildFilteredListHref({
                      month,
                      conditions: { ...conditions, [split]: key },
                      scope,
                      from: "analytics",
                      returnState,
                    })
                  }
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <TrendComposedChart
              points={trendData.points}
              barColor={
                filter === null
                  ? TOTAL_BAR_COLOR
                  : keyColor(filter.dimension, filter.key, data)
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
                      conditions,
                      scope,
                      from: "analytics",
                      returnState,
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
