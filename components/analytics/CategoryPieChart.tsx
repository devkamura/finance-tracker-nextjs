"use client";

import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import type { PieSectorShapeProps } from "recharts";

import { formatYen, type PieSlice } from "@/lib/analytics/aggregate";
import { categoryColor } from "@/lib/analytics/category-colors";
import type { AnalyticsCategory } from "@/lib/analytics/types";

// 選ばれた扇を外にずらして見せる幅（px）。outerRadius="85%" の余白に収まる大きさにする。
const ACTIVE_SECTOR_OFFSET = 8;

// 扇の描画。タップ・マウスオーバー・キーボードで選ばれた扇（isActive）だけ半径を少し大きくし、
// 外に飛び出して見えるようにする。ブラウザ標準のフォーカス枠は図形の外接矩形で描かれ、
// 3/4の扇を選ぶと円全体を囲ってしまうため使わない（下のoutline-noneで消す）。
function renderSector(props: PieSectorShapeProps) {
  return (
    <Sector
      {...props}
      outerRadius={props.isActive ? props.outerRadius + ACTIVE_SECTOR_OFFSET : props.outerRadius}
    />
  );
}

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
    // 扇のフォーカス時に出るブラウザ標準の四角い枠を消す（選択中の扇はrenderSectorで強調する）
    <div className="h-60 w-full [&_*:focus]:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="amount"
            nameKey="name"
            innerRadius="45%"
            outerRadius="85%"
            stroke="#ffffff"
            shape={renderSector}
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
