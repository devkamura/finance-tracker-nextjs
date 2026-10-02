"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatYen, type TrendPoint } from "@/lib/analytics/aggregate";

type TrendComposedChartProps = {
  points: TrendPoint[];
  barColor: string;
};

const LINE_COLOR = "#334155"; // slate-700
const REFERENCE_COLOR = "#94a3b8"; // slate-400

// "2026-09" → "9月"（X軸用。年はグラフの下に期間として表示する）
function shortMonthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}月`;
}

// "2026-09" → "2026年9月"（ツールチップ用）
function fullMonthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}

// 左軸の目盛り。1万円以上は「3万」のように万円単位で短く表示する。
function formatAxisYen(value: number): string {
  return value >= 10000 ? `${Math.round((value / 10000) * 10) / 10}万` : `${value}`;
}

type TooltipEntry = { payload: TrendPoint };

// 棒・点にマウスを乗せた（タップした）ときの表示。金額は描画上の値ではなく実際の値を出す。
function TrendTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{fullMonthLabel(point.month)}</p>
      <p className={point.amount < 0 ? "text-red-600" : "text-slate-700"}>
        {formatYen(point.amount)}
      </p>
      <p className="text-slate-500">
        前月比 {point.mom === null ? "―" : `${point.mom.toFixed(1)}%`}
      </p>
    </div>
  );
}

// 過去12ヶ月の金額（棒・左軸）と前月比（折れ線・右軸）の複合グラフ（基本設計書2.4節）。
// 右軸の100%（前月と同じ）に基準線を引く。前月比を算出しない月は線を途切れさせる。
export function TrendComposedChart({ points, barColor }: TrendComposedChartProps) {
  const chartData = points.map((p) => ({ ...p, label: shortMonthLabel(p.month) }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} tickLine={false} />
          <YAxis
            yAxisId="amount"
            tickFormatter={formatAxisYen}
            tick={{ fontSize: 11 }}
            width={44}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="mom"
            orientation="right"
            unit="%"
            // 100%の基準線が必ず見えるよう、上限は100%以上にする
            domain={[0, (dataMax: number) => Math.ceil((Math.max(dataMax, 100) * 1.1) / 10) * 10]}
            tick={{ fontSize: 11 }}
            width={44}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar yAxisId="amount" dataKey="barValue" fill={barColor} isAnimationActive={false} />
          <ReferenceLine
            yAxisId="mom"
            y={100}
            stroke={REFERENCE_COLOR}
            strokeDasharray="4 4"
            label={{ value: "100%", position: "insideTopRight", fontSize: 10, fill: REFERENCE_COLOR }}
          />
          <Line
            yAxisId="mom"
            dataKey="mom"
            stroke={LINE_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: LINE_COLOR }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
