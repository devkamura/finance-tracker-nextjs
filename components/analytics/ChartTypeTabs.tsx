"use client";

import type { ChartType } from "@/lib/analytics/url-state";

type ChartTypeTabsProps = {
  value: ChartType;
  onChange: (value: ChartType) => void;
};

const TABS: { value: ChartType; label: string }[] = [
  { value: "pie", label: "円グラフ" },
  { value: "trend", label: "推移グラフ" },
];

// 分析画面のグラフ種類（円グラフ／推移グラフ）の切り替え。
export function ChartTypeTabs({ value, onChange }: ChartTypeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="グラフの種類"
      className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1"
    >
      {TABS.map((tab) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={`rounded-md py-1.5 text-sm transition-colors ${
              selected
                ? "bg-white font-bold text-slate-900 shadow-sm"
                : "font-medium text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
