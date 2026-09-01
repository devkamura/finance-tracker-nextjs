"use client";

import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const shifted = new Date(year, m - 1 + delta, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`;
}

// [minMonth, maxMonth]の範囲（両端含む）を"YYYY-MM"の配列で列挙する。
function enumerateMonths(minMonth: string, maxMonth: string): string[] {
  const months: string[] = [];
  let cursor = minMonth;
  // 保持期間は最大12ヶ月程度の想定のため、上限を設けて無限ループを防止する。
  for (let i = 0; i < 240 && cursor <= maxMonth; i++) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months;
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${year}年${m}月`;
}

type MonthSelectorProps = {
  basePath: string;
  month: string; // "YYYY-MM"
  // 月を切り替える際に維持したい他のクエリパラメータ（例：ソート順）
  extraParams?: Record<string, string>;
  // 選択可能な範囲（"YYYY-MM"）。データは当月から12ヶ月分のみ保持する運用のため、
  // それ以外の月は選べないようにする（省略時は制限なし＝前後1年分を列挙）。
  minMonth?: string;
  maxMonth?: string;
};

// 一覧・精算画面共通の月切り替えUI（デフォルト当月）。
// 中央の年月表示は<select>になっており、クリックすると選択可能な月の一覧から
// 直接選べる（<input type="month">はSafari等でネイティブUIが機能しないため
// 採用していない）。前後の矢印ボタンでも1ヶ月ずつ移動できる。
export function MonthSelector({
  basePath,
  month,
  extraParams = {},
  minMonth,
  maxMonth,
}: MonthSelectorProps) {
  const router = useRouter();
  const options = enumerateMonths(
    minMonth ?? shiftMonth(month, -12),
    maxMonth ?? shiftMonth(month, 12)
  );

  const navigateTo = (targetMonth: string) => {
    if (minMonth && targetMonth < minMonth) return;
    if (maxMonth && targetMonth > maxMonth) return;
    const params = new URLSearchParams({ ...extraParams, month: targetMonth });
    router.push(`${basePath}?${params.toString()}`);
  };

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const prevDisabled = Boolean(minMonth && prevMonth < minMonth);
  const nextDisabled = Boolean(maxMonth && nextMonth > maxMonth);

  return (
    <div className="flex items-center justify-center gap-4 text-sm">
      <button
        type="button"
        onClick={() => navigateTo(prevMonth)}
        disabled={prevDisabled}
        aria-label="前の月"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>

      <select
        value={month}
        onChange={(e) => navigateTo(e.target.value)}
        aria-label="月を選択"
        className="cursor-pointer rounded-lg border border-transparent bg-transparent px-2 py-1 text-center font-medium text-slate-900 hover:border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {formatMonthLabel(value)}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => navigateTo(nextMonth)}
        disabled={nextDisabled}
        aria-label="次の月"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <FontAwesomeIcon icon={faChevronRight} />
      </button>
    </div>
  );
}
