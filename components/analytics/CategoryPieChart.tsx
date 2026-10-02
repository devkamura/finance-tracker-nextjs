"use client";

import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatYen, type PieSlice } from "@/lib/analytics/aggregate";
import { categoryColor } from "@/lib/analytics/category-colors";
import type { AnalyticsCategory } from "@/lib/analytics/types";

type CategoryPieChartProps = {
  slices: PieSlice[];
  categories: AnalyticsCategory[];
};

// カテゴリ別の構成比を表す円グラフ。扇はプラスのカテゴリだけ（マイナスは描画上0、
// 基本設計書3.7節）。凡例は下の内訳表で代用し、扇のホバー／タップで名前・金額・％を出す。
export function CategoryPieChart({ slices, categories }: CategoryPieChartProps) {
  // Rechartsはデータの各要素のfillを扇の色として使う（非推奨のCellは使わない）
  const chartData = slices.map((slice) => ({
    name: categories.find((c) => c.id === slice.categoryId)?.name ?? "不明",
    amount: slice.amount,
    percent: slice.percent,
    fill: categoryColor(slice.categoryId, categories),
  }));

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="amount"
            nameKey="name"
            innerRadius="45%"
            outerRadius="85%"
            stroke="#ffffff"
            isAnimationActive={false}
          />
          <Tooltip
            formatter={(value, _name, item) => [
              `${formatYen(Number(value))}（${item.payload.percent}%）`,
              item.payload.name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
