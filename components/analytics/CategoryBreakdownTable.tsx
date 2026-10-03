"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

import { formatYen, type PieData } from "@/lib/analytics/aggregate";
import { categoryColor } from "@/lib/analytics/category-colors";
import type { AnalyticsCategory } from "@/lib/analytics/types";

type CategoryBreakdownTableProps = {
  pieData: PieData;
  categories: AnalyticsCategory[];
  // カテゴリごとの、絞り込んだレシート一覧へのURL
  hrefFor: (categoryId: number) => string;
};

// 円グラフの凡例を兼ねるカテゴリ別の内訳表。
// プラスのカテゴリ（％付き）→ 0円 → マイナスのカテゴリ（％なし）の順に並べる。
// 各行はレシート一覧へのリンク（詳細設計書 フェーズ3 3章）。円グラフの扇のタップは
// 金額の表示だけにし、一覧への移動はこの表に統一する（扇のないマイナスのカテゴリもたどれる）。
export function CategoryBreakdownTable({
  pieData,
  categories,
  hrefFor,
}: CategoryBreakdownTableProps) {
  const nameOf = (categoryId: number) =>
    categories.find((c) => c.id === categoryId)?.name ?? "不明";

  const rows = [
    ...pieData.slices.map((s) => ({ ...s, percentLabel: `${s.percent.toFixed(1)}%` })),
    ...[...pieData.zeroCategories, ...pieData.negatives].map((c) => ({
      ...c,
      percentLabel: "―",
    })),
  ];

  return (
    <div className="flex flex-col">
      <p className="mb-1 text-xs text-slate-400">行をタップすると、そのカテゴリのレシートを見られます</p>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {rows.map((row) => (
          <li key={row.categoryId}>
            <Link
              href={hrefFor(row.categoryId)}
              // 本番では表示中のLinkを先読みするため、月や表示対象を切り替えるたびに
              // サーバー通信が発生してしまう。分析画面の操作中は通信しない要件のため、先読みを止める。
              prefetch={false}
              className="flex items-center gap-2 py-2 text-sm hover:bg-slate-50 active:bg-slate-100"
            >
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    row.amount > 0 ? categoryColor(row.categoryId, categories) : "transparent",
                }}
              />
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {nameOf(row.categoryId)}
              </span>
              <span className="w-14 text-right text-slate-500">{row.percentLabel}</span>
              <span
                className={`w-24 text-right font-medium ${
                  row.amount < 0 ? "text-red-600" : "text-slate-900"
                }`}
              >
                {formatYen(row.amount)}
              </span>
              <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 text-slate-300" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
