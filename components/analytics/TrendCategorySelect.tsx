"use client";

import type { AnalyticsCategory } from "@/lib/analytics/types";

type TrendCategorySelectProps = {
  categories: AnalyticsCategory[];
  categoryId: number | null; // null＝総支出
  onChange: (categoryId: number | null) => void;
};

const TOTAL_VALUE = "total";

// 推移グラフで表示するカテゴリの選択。「総支出」＋全カテゴリ（ID順）。
// 12ヶ月間に支出のないカテゴリも選べる（詳細設計書 フェーズ2 確認事項2）。
export function TrendCategorySelect({
  categories,
  categoryId,
  onChange,
}: TrendCategorySelectProps) {
  return (
    <label className="flex items-center justify-center gap-2 text-sm text-slate-600">
      カテゴリ
      <select
        value={categoryId === null ? TOTAL_VALUE : String(categoryId)}
        onChange={(e) =>
          onChange(e.target.value === TOTAL_VALUE ? null : Number(e.target.value))
        }
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
      >
        <option value={TOTAL_VALUE}>総支出</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
