// 支出分析で使う月の計算（docs/支出分析機能/詳細設計書.md 3章）。
// サーバーはinstrumentation.tsでTZ=Asia/Tokyoに固定されているため、
// 既存のlib/receipts/queries.tsのmonthPeriodと同じくローカル時刻のgetterで
// JSTの年月日を取り出す（一覧・精算と同じ規則で月を判定するため）。
// ブラウザには"YYYY-MM"・"YYYY-MM-DD"の文字列だけを渡し、日付計算はサーバー側で完結させる。

const ANALYTICS_MONTHS = 12;

const pad = (n: number) => String(n).padStart(2, "0");

// 今日を"YYYY-MM-DD"で返す。
export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// その時刻が属する月を"YYYY-MM"で返す。
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

// "YYYY-MM"をnヶ月ずらす（nは負も可）。
export function addMonths(monthKey: string, n: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  return monthKeyOf(new Date(year, month - 1 + n, 1));
}

// 当月を含む12ヶ月を古い順に返す（例："2026-10-03" → ["2025-11", …, "2026-10"]）。
export function lastTwelveMonths(today: string): string[] {
  const current = today.slice(0, 7);
  return Array.from({ length: ANALYTICS_MONTHS }, (_, i) =>
    addMonths(current, i - (ANALYTICS_MONTHS - 1))
  );
}

// 月の一覧（古い順）全体をカバーする取得範囲を[from, to)の半開区間で返す。
export function monthRange(months: string[]): { from: Date; to: Date } {
  const [firstYear, firstMonth] = months[0].split("-").map(Number);
  const [lastYear, lastMonth] = months[months.length - 1].split("-").map(Number);
  return {
    from: new Date(firstYear, firstMonth - 1, 1),
    to: new Date(lastYear, lastMonth, 1),
  };
}
