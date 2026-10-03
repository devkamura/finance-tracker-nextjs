"use client";

import Link from "next/link";

import { formatYen, type TrendPoint } from "@/lib/analytics/aggregate";

type TrendSelectedMonthProps = {
  point: TrendPoint | null; // 推移グラフで選択中の月。null＝未選択
  monthLabel: string; // "2026年7月"
  href: string | null; // 絞り込んだレシート一覧へのURL
};

// 推移グラフで棒をタップして選んだ月の金額・前月比と、その月のレシート一覧への導線。
// グラフのタップは「見るだけ」とし、一覧への移動はこのリンクからに統一する
// （スマホで金額を見ようとしてタップしただけで画面が移らないようにするため。詳細設計書 フェーズ3 3章）。
export function TrendSelectedMonth({ point, monthLabel, href }: TrendSelectedMonthProps) {
  if (!point || !href) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
        棒をタップすると、その月のレシートを見られます。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="font-medium text-slate-900">{monthLabel}</span>
        <span className={point.amount < 0 ? "text-red-600" : "text-slate-900"}>
          {formatYen(point.amount)}
        </span>
        <span className="text-xs text-slate-500">
          前月比 {point.mom === null ? "―" : `${point.mom.toFixed(1)}%`}
        </span>
      </p>
      {/* 本番では表示中のLinkを先読みするため、月を選ぶたびにサーバー通信が発生してしまう。
          分析画面の操作中は通信しない要件のため、先読みを止める（CategoryBreakdownTableと同じ）。 */}
      <Link
        href={href}
        prefetch={false}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        この月のレシートを見る →
      </Link>
    </div>
  );
}
