"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

type AnalyticsMonthSelectProps = {
  months: string[]; // 選択できる月（古い順、"YYYY-MM"）
  month: string;
  onChange: (month: string) => void;
};

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${year}年${m}月`;
}

// 分析画面の月の選択。見た目は一覧・精算画面のMonthSelectorに合わせているが、
// MonthSelectorはURL遷移（サーバー通信）を行うため使わず、画面内の状態だけを変える。
export function AnalyticsMonthSelect({ months, month, onChange }: AnalyticsMonthSelectProps) {
  const index = months.indexOf(month);
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < months.length - 1;

  const arrowClass =
    "rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => hasPrev && onChange(months[index - 1])}
        disabled={!hasPrev}
        aria-label="前の月"
        className={arrowClass}
      >
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>
      <select
        value={month}
        onChange={(e) => onChange(e.target.value)}
        aria-label="表示する月"
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonthLabel(m)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => hasNext && onChange(months[index + 1])}
        disabled={!hasNext}
        aria-label="次の月"
        className={arrowClass}
      >
        <FontAwesomeIcon icon={faChevronRight} />
      </button>
    </div>
  );
}
