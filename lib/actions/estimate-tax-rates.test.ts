import { beforeEach, describe, expect, it, vi } from "vitest";

import { estimateReceiptItemTaxRates } from "@/lib/actions/estimate-tax-rates";
import { estimateTaxRatesForItemNames } from "@/lib/gemini/estimate-tax-rate";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/gemini/estimate-tax-rate", () => ({
  estimateTaxRatesForItemNames: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedEstimate = vi.mocked(estimateTaxRatesForItemNames);

function fakeSupabase(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("estimateReceiptItemTaxRates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未ログインの場合はエラーを返す", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase(null));

    const result = await estimateReceiptItemTaxRates(["おにぎり"]);
    expect(result).toEqual({ success: false, error: "ログインが必要です。" });
    expect(mockedEstimate).not.toHaveBeenCalled();
  });

  it("商品名が空配列の場合はGeminiを呼ばず空配列を返す", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase("user-1"));

    const result = await estimateReceiptItemTaxRates([]);
    expect(result).toEqual({ success: true, data: [] });
    expect(mockedEstimate).not.toHaveBeenCalled();
  });

  it("正常系：推定結果をそのまま返す", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase("user-1"));
    mockedEstimate.mockResolvedValue([8, 10, null]);

    const result = await estimateReceiptItemTaxRates([
      "おにぎり",
      "ビール",
      "謎の商品",
    ]);
    expect(result).toEqual({ success: true, data: [8, 10, null] });
  });

  it("Gemini呼び出し失敗時はエラーメッセージを返す", async () => {
    mockedCreateClient.mockResolvedValue(fakeSupabase("user-1"));
    mockedEstimate.mockRejectedValue(new Error("API error"));

    const result = await estimateReceiptItemTaxRates(["おにぎり"]);
    expect(result).toEqual({ success: false, error: "税率の推定に失敗しました。" });
  });
});
