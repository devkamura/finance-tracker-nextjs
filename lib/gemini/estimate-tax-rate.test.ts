import { beforeEach, describe, expect, it, vi } from "vitest";

import { getGeminiClient } from "@/lib/gemini/client";
import { estimateTaxRatesForItemNames } from "@/lib/gemini/estimate-tax-rate";

vi.mock("@/lib/gemini/client", () => ({ getGeminiClient: vi.fn() }));

const mockedGetGeminiClient = vi.mocked(getGeminiClient);

function fakeAi(responseText: string) {
  return {
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: responseText }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("estimateTaxRatesForItemNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("商品名が空配列の場合はGeminiを呼ばず空配列を返す", async () => {
    const result = await estimateTaxRatesForItemNames([]);
    expect(result).toEqual([]);
    expect(mockedGetGeminiClient).not.toHaveBeenCalled();
  });

  it("indexに基づいて正しい順序で結果をマッピングする（Geminiが順序を入れ替えて返しても対応する）", async () => {
    mockedGetGeminiClient.mockReturnValue(
      fakeAi(
        JSON.stringify({
          results: [
            { index: 1, taxRatePercent: 10 },
            { index: 0, taxRatePercent: 8 },
          ],
        })
      )
    );

    const result = await estimateTaxRatesForItemNames(["おにぎり", "ビール"]);
    expect(result).toEqual([8, 10]);
  });

  it("8/10以外の値やresultsに含まれないindexはnullとして扱う", async () => {
    mockedGetGeminiClient.mockReturnValue(
      fakeAi(
        JSON.stringify({
          results: [{ index: 0, taxRatePercent: 5 }],
        })
      )
    );

    const result = await estimateTaxRatesForItemNames(["謎の商品", "ノート"]);
    expect(result).toEqual([null, null]);
  });

  it("空レスポンスの場合はエラーを投げる", async () => {
    mockedGetGeminiClient.mockReturnValue(fakeAi(""));

    await expect(estimateTaxRatesForItemNames(["おにぎり"])).rejects.toThrow(
      "Geminiからの応答が空です。"
    );
  });
});
