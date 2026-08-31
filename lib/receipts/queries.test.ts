import { describe, expect, it } from "vitest";

import {
  parseMonthParam,
  retentionMonthRange,
  toMonthParam,
} from "@/lib/receipts/queries";

describe("retentionMonthRange", () => {
  it("当月からさかのぼって12ヶ月分（当月含む）を範囲とする", () => {
    const base = new Date(2026, 7, 15); // 2026年8月15日
    const { min, max } = retentionMonthRange(base);
    expect(toMonthParam(max)).toBe("2026-08");
    expect(toMonthParam(min)).toBe("2025-09"); // 当月含めて12ヶ月分さかのぼった月初
  });

  it("年をまたぐ場合も正しく計算される", () => {
    const base = new Date(2026, 1, 1); // 2026年2月
    const { min } = retentionMonthRange(base);
    expect(toMonthParam(min)).toBe("2025-03");
  });
});

describe("parseMonthParam", () => {
  it("有効な'YYYY-MM'をパースする", () => {
    const date = parseMonthParam("2026-05");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4); // 0始まり
  });

  it("不正な値は当月にフォールバックする", () => {
    const date = parseMonthParam("invalid");
    const now = new Date();
    expect(date.getFullYear()).toBe(now.getFullYear());
    expect(date.getMonth()).toBe(now.getMonth());
  });

  it("省略時は当月にフォールバックする", () => {
    const date = parseMonthParam(undefined);
    const now = new Date();
    expect(date.getFullYear()).toBe(now.getFullYear());
    expect(date.getMonth()).toBe(now.getMonth());
  });

  it("保持期間より過去の月は、保持範囲の最古月にクランプされる", () => {
    const date = parseMonthParam("2000-01");
    expect(toMonthParam(date)).toBe(toMonthParam(retentionMonthRange().min));
  });

  it("未来の月は、当月にクランプされる", () => {
    const date = parseMonthParam("2099-12");
    expect(toMonthParam(date)).toBe(toMonthParam(retentionMonthRange().max));
  });
});
