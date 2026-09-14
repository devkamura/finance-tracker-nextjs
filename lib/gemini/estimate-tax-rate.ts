import "server-only";

import { Type } from "@google/genai";

import { getGeminiClient } from "@/lib/gemini/client";

const MODEL_ID = "gemini-2.5-flash";

const ESTIMATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      description: "入力された商品名リストと同じ順序・同じ件数で税率推定結果を返す。",
      items: {
        type: Type.OBJECT,
        properties: {
          index: {
            type: Type.INTEGER,
            description: "入力リストにおける商品名のインデックス（0始まり）。",
          },
          taxRatePercent: {
            type: Type.INTEGER,
            nullable: true,
            description:
              "商品名から推定した消費税率。軽減税率(8)または標準税率(10)のいずれか。判断できない場合はnull。",
          },
        },
        required: ["index"],
      },
    },
  },
  required: ["results"],
};

function buildPrompt(itemNames: string[]): string {
  const list = itemNames.map((name, index) => `${index}: ${name}`).join("\n");
  return `あなたは日本の消費税率に詳しいアシスタントです。
以下の商品名リストそれぞれについて、軽減税率（8%）と標準税率（10%）のどちらが適用されるかを推定してください。

- 食品・飲料（酒類・外食を除く）は軽減税率(8)。
- それ以外（日用品・酒類・外食・サービス等）は標準税率(10)。
- 商品名から判断できない場合は taxRatePercent を null にしてください。

これはあくまで参考値であり、最終的な税率はユーザーが確認・変更します。

商品名リスト：
${list}`;
}

type RawEstimateResponse = {
  results?: { index?: number; taxRatePercent?: number | null }[];
};

function normalizeTaxRatePercent(value: number | null | undefined): 8 | 10 | null {
  return value === 8 || value === 10 ? value : null;
}

// 商品名から消費税率(8%/10%)を推定する（手動入力向け）。
// 戻り値はitemNamesと同じ長さ・同じ順序の配列。
export async function estimateTaxRatesForItemNames(
  itemNames: string[]
): Promise<(8 | 10 | null)[]> {
  if (itemNames.length === 0) {
    return [];
  }

  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [{ role: "user", parts: [{ text: buildPrompt(itemNames) }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: ESTIMATE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Geminiからの応答が空です。");
  }

  const parsed = JSON.parse(text) as RawEstimateResponse;
  const results = new Array<8 | 10 | null>(itemNames.length).fill(null);
  for (const result of parsed.results ?? []) {
    if (
      typeof result.index === "number" &&
      result.index >= 0 &&
      result.index < itemNames.length
    ) {
      results[result.index] = normalizeTaxRatePercent(result.taxRatePercent);
    }
  }
  return results;
}
