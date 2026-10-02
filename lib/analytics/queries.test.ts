import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_PAGE_SIZE,
  buildAnalyticsRows,
  getAnalyticsData,
} from "@/lib/analytics/queries";
import { getGroupMembers } from "@/lib/supabase/group";

vi.mock("@/lib/supabase/group", () => ({ getGroupMembers: vi.fn() }));

const mockedGetGroupMembers = vi.mocked(getGroupMembers);

const USER_A = "user-a";
const USER_B = "user-b";
const FOOD = 1;
const DAILY = 2;

type DetailInput = {
  price: number;
  category_id?: number;
  owner_user_id?: string | null;
  tax_type?: "inclusive" | "exclusive";
  multiplier?: number;
};

function buildReceipt(
  overrides: {
    id?: string;
    occurred_at?: string;
    amount?: number;
    refund?: boolean;
    details?: DetailInput[];
  } = {}
) {
  return {
    id: overrides.id ?? "receipt-1",
    occurred_at: overrides.occurred_at ?? new Date(2026, 8, 10, 12, 0).toISOString(),
    amount: overrides.amount ?? 1000,
    payer_user_id: USER_A,
    transaction_types: { name: overrides.refund ? "返金" : "支出" },
    receipt_details: (overrides.details ?? [{ price: 1000 }]).map((d) => ({
      price: d.price,
      tax_type: d.tax_type ?? "inclusive",
      category_id: d.category_id ?? FOOD,
      owner_user_id: d.owner_user_id === undefined ? null : d.owner_user_id,
      consumption_taxes: d.multiplier ? { multiplier: d.multiplier } : null,
    })),
  };
}

// getAnalyticsDataが使うクエリビルダーのチェーンを再現する。
// receiptsはrange()ごとにpagesを1ページずつ返し、呼び出し時の引数を記録する。
function fakeSupabase(pages: unknown[][]) {
  const calls = { range: [] as [number, number][], gte: [] as string[], lt: [] as string[] };
  let pageIndex = 0;
  const receiptsChain = {
    select: () => receiptsChain,
    eq: () => receiptsChain,
    gte: (_column: string, value: string) => {
      calls.gte.push(value);
      return receiptsChain;
    },
    lt: (_column: string, value: string) => {
      calls.lt.push(value);
      return receiptsChain;
    },
    order: () => receiptsChain,
    range: (from: number, to: number) => {
      calls.range.push([from, to]);
      const data = pages[pageIndex] ?? [];
      pageIndex += 1;
      return Promise.resolve({ data, error: null });
    },
  };
  const categoriesChain = {
    select: () => categoriesChain,
    order: () =>
      Promise.resolve({
        data: [
          { id: FOOD, name: "食費" },
          { id: DAILY, name: "日用品" },
        ],
        error: null,
      }),
  };
  const client = {
    from: (table: string) => (table === "receipts" ? receiptsChain : categoriesChain),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

describe("buildAnalyticsRows", () => {
  it("U-63: 明細合計と支払額が違う場合、精算と同じく支払額を明細の比率で按分する", () => {
    const rows = buildAnalyticsRows([
      buildReceipt({
        amount: 1500,
        details: [
          { price: 1000, category_id: FOOD, owner_user_id: null },
          { price: 1000, category_id: DAILY, owner_user_id: USER_B },
        ],
      }),
    ]);
    expect(rows).toEqual(
      expect.arrayContaining([
        { month: "2026-09", categoryId: FOOD, ownerUserId: null, amount: 750 },
        { month: "2026-09", categoryId: DAILY, ownerUserId: USER_B, amount: 750 },
      ])
    );
  });

  it("U-63: 税別明細は税込換算した額を按分の比率に使う", () => {
    const rows = buildAnalyticsRows([
      buildReceipt({
        amount: 2080,
        details: [
          { price: 1000, tax_type: "exclusive", multiplier: 1.08, category_id: FOOD },
          { price: 1000, tax_type: "inclusive", category_id: DAILY },
        ],
      }),
    ]);
    expect(rows.find((r) => r.categoryId === FOOD)?.amount).toBe(1080);
    expect(rows.find((r) => r.categoryId === DAILY)?.amount).toBe(1000);
  });

  it("U-64: 返金レシートは按分結果がマイナスになる", () => {
    const rows = buildAnalyticsRows([
      buildReceipt({ amount: 8000, refund: true, details: [{ price: 8000 }] }),
    ]);
    expect(rows).toEqual([
      { month: "2026-09", categoryId: FOOD, ownerUserId: null, amount: -8000 },
    ]);
  });

  it("U-65: 同じ月×カテゴリ×帰属先の明細は1行に合計され、異なるものは別の行になる", () => {
    const rows = buildAnalyticsRows([
      buildReceipt({ id: "r1", amount: 1200, details: [{ price: 1200 }] }),
      buildReceipt({ id: "r2", amount: 800, details: [{ price: 800 }] }),
      buildReceipt({ id: "r3", amount: 500, details: [{ price: 500, owner_user_id: USER_A }] }),
      buildReceipt({
        id: "r4",
        amount: 300,
        occurred_at: new Date(2026, 9, 1, 0, 0).toISOString(),
        details: [{ price: 300 }],
      }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        { month: "2026-09", categoryId: FOOD, ownerUserId: null, amount: 2000 },
        { month: "2026-09", categoryId: FOOD, ownerUserId: USER_A, amount: 500 },
        { month: "2026-10", categoryId: FOOD, ownerUserId: null, amount: 300 },
      ])
    );
  });

  it("明細のないレシートは集計に含めない", () => {
    expect(buildAnalyticsRows([buildReceipt({ details: [] })])).toEqual([]);
  });
});

describe("getAnalyticsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetGroupMembers.mockResolvedValue([
      { userId: USER_A, role: "admin", displayName: "あきら", color: "blue" },
      { userId: USER_B, role: "member", displayName: "みき", color: "red" },
    ]);
  });

  it("U-66: 1ページ目が上限件数なら次のページを取得し、上限未満のページで止める", async () => {
    const fullPage = Array.from({ length: ANALYTICS_PAGE_SIZE }, (_, i) =>
      buildReceipt({ id: `r${i}`, amount: 1, details: [{ price: 1 }] })
    );
    const lastPage = [buildReceipt({ id: "last", amount: 1, details: [{ price: 1 }] })];
    const { client, calls } = fakeSupabase([fullPage, lastPage]);

    const data = await getAnalyticsData(client, "group-1", new Date(2026, 9, 3));

    expect(calls.range).toEqual([
      [0, ANALYTICS_PAGE_SIZE - 1],
      [ANALYTICS_PAGE_SIZE, ANALYTICS_PAGE_SIZE * 2 - 1],
    ]);
    expect(data.rows).toEqual([
      { month: "2026-09", categoryId: FOOD, ownerUserId: null, amount: ANALYTICS_PAGE_SIZE + 1 },
    ]);
  });

  it("U-67: 取得条件が当月を含む12ヶ月の範囲になり、画面用のデータを返す", async () => {
    const { client, calls } = fakeSupabase([[]]);

    const data = await getAnalyticsData(client, "group-1", new Date(2026, 9, 3, 8, 0));

    expect(calls.gte).toEqual([new Date(2025, 10, 1).toISOString()]);
    expect(calls.lt).toEqual([new Date(2026, 10, 1).toISOString()]);
    expect(data.today).toBe("2026-10-03");
    expect(data.months[0]).toBe("2025-11");
    expect(data.months[11]).toBe("2026-10");
    expect(data.categories.map((c) => c.name)).toEqual(["食費", "日用品"]);
    expect(data.members).toEqual([
      { userId: USER_A, displayName: "あきら", color: "blue" },
      { userId: USER_B, displayName: "みき", color: "red" },
    ]);
  });
});
