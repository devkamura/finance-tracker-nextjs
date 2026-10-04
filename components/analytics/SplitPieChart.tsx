"use client";

import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import type { PieSectorShapeProps } from "recharts";

import { formatYen, type PieSlice } from "@/lib/analytics/aggregate";

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

type SplitPieChartProps = {
  slices: PieSlice[];
  // 「分ける」項目の値の表示名と色（カテゴリ・内訳・費用区分・支払い先・相手で共通）
  labelOf: (key: string) => string;
  colorOf: (key: string) => string;
};

// 「分ける」項目（カテゴリ・内訳など）ごとの構成比を表す円グラフ。扇はプラスの値だけ
// （マイナスは描画上0、基本設計書3.7節）。凡例は下の表で代用し、扇のホバー／タップで名前・金額・％を出す。
export function SplitPieChart({ slices, labelOf, colorOf }: SplitPieChartProps) {
  // Rechartsはデータの各要素のfillを扇の色として使う（非推奨のCellは使わない）
  const chartData = slices.map((slice) => ({
    name: labelOf(slice.key),
    amount: slice.amount,
    percent: slice.percent,
    fill: colorOf(slice.key),
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
