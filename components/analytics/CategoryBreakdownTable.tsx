"use client";

import { formatYen, type PieData } from "@/lib/analytics/aggregate";
import { categoryColor } from "@/lib/analytics/category-colors";
import type { AnalyticsCategory } from "@/lib/analytics/types";

type CategoryBreakdownTableProps = {
  pieData: PieData;
  categories: AnalyticsCategory[];
};

// 円グラフの凡例を兼ねるカテゴリ別の内訳表。
// プラスのカテゴリ（％付き）→ 0円 → マイナスのカテゴリ（％なし）の順に並べる。
export function CategoryBreakdownTable({ pieData, categories }: CategoryBreakdownTableProps) {
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
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.categoryId} className="border-t border-slate-100">
            <td className="py-2">
              <span className="flex items-center gap-2 text-slate-700">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      row.amount > 0 ? categoryColor(row.categoryId, categories) : "transparent",
                  }}
                />
                {nameOf(row.categoryId)}
              </span>
            </td>
            <td className="py-2 text-right text-slate-500">{row.percentLabel}</td>
            <td
              className={`py-2 text-right font-medium ${
                row.amount < 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              {formatYen(row.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
