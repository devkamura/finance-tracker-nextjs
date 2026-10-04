import { describe, expect, it } from "vitest";

import {
  addMonths,
  lastTwelveMonths,
  monthKeyOf,
  monthRange,
  todayKey,
} from "@/lib/analytics/months";
import { monthPeriod } from "@/lib/receipts/queries";

describe("months", () => {
  it("U-60: 月キーは月末23:59と翌月1日0:00で切り替わり、既存のmonthPeriodと同じ判定になる", () => {
    const endOfSeptember = new Date(2026, 8, 30, 23, 59);
    const startOfOctober = new Date(2026, 9, 1, 0, 0);
    expect(monthKeyOf(endOfSeptember)).toBe("2026-09");
    expect(monthKeyOf(startOfOctober)).toBe("2026-10");

    // 一覧・精算が使うmonthPeriodの範囲と一致すること
    const september = monthPeriod(new Date(2026, 8, 15));
    expect(endOfSeptember < september.to).toBe(true);
    expect(startOfOctober >= september.to).toBe(true);
  });

  it("U-60: 今日を YYYY-MM-DD で返す", () => {
    expect(todayKey(new Date(2026, 9, 3, 8, 0))).toBe("2026-10-03");
  });

  it("U-61: 当月を含む12ヶ月を古い順に返し、年をまたげる", () => {
    expect(lastTwelveMonths("2026-10-03")).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    const march = lastTwelveMonths("2026-03-31");
    expect(march[0]).toBe("2025-04");
    expect(march[11]).toBe("2026-03");
  });

  it("U-61: 月キーをずらせる（年をまたぐ）", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
  });

  it("U-62: 取得範囲は最初の月の1日0時から、最後の月の翌月1日0時の手前まで", () => {
    const { from, to } = monthRange(lastTwelveMonths("2026-10-03"));
    expect(from).toEqual(new Date(2025, 10, 1));
    expect(to).toEqual(new Date(2026, 10, 1));
  });
});
