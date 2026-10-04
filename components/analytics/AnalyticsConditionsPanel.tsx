"use client";

import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faSliders } from "@fortawesome/free-solid-svg-icons";

type AnalyticsConditionsPanelProps = {
  summary: string; // 閉じているときに出す今の条件（「全体 ／ 食費 ／ 内訳で分ける」など）
  children: ReactNode; // 表示対象・絞り込み・分けるの選択欄
};

// 分析画面の条件（表示対象・絞り込み・分ける）をまとめた折りたたみ（docs/分析拡充/詳細設計書.md F4 5章）。
// スマホでは選択欄を並べるとグラフが画面の下に押し出されるため、最初は閉じておき、
// 今の条件を1行で見せる。条件を変えるときだけ開く（開閉は画面の中だけで、URLには残さない）。
export function AnalyticsConditionsPanel({ summary, children }: AnalyticsConditionsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
      >
        <FontAwesomeIcon icon={faSliders} className="shrink-0 text-xs text-slate-400" />
        <span className="shrink-0 text-slate-500">条件</span>
        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{summary}</span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-3 pb-3 pt-3">{children}</div>
      )}
    </div>
  );
}
