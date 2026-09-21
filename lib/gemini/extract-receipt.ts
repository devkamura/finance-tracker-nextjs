import "server-only";

import { Type } from "@google/genai";

import { getGeminiClient } from "@/lib/gemini/client";
import type { OcrReceiptResult } from "@/types/receipt";

const MODEL_ID = "gemini-2.5-flash";

const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    payeeName: {
      type: Type.STRING,
      nullable: true,
      description: "レシートに記載されている支払い先名。読み取れない場合はnull。",
    },
    datetime: {
      type: Type.STRING,
      nullable: true,
      description:
        "レシートに記載されている購入日時。'YYYY-MM-DDTHH:mm' 形式で出力する。時刻が読み取れない場合は00:00を補う。日付自体が読み取れない場合はnull。",
    },
    totalPrice: {
      type: Type.INTEGER,
      nullable: true,
      description: "レシートに記載されている合計金額（税込・整数）。読み取れない場合はnull。",
    },
    items: {
      type: Type.ARRAY,
      description: "レシートに記載されている購入商品の一覧。",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "商品名" },
          price: {
            type: Type.INTEGER,
            description:
              "その商品の行にレシート上で印字されている金額をそのまま整数で出力する。税込表示・税別表示のどちらであっても印字された数字をそのまま転記し、税率を掛けたり割ったりする換算計算は絶対に行わないこと。値引き前の金額をそのまま出力する。",
          },
          discount: {
            type: Type.INTEGER,
            nullable: true,
            description:
              "その商品に適用された値引き額（整数）。値引きがない場合はnull。",
          },
          taxRatePercent: {
            type: Type.INTEGER,
            nullable: true,
            description:
              "商品名から推定した消費税率。軽減税率(8)または標準税率(10)のいずれか。判断できない場合はnull。",
          },
        },
        required: ["name", "price"],
      },
    },
  },
  required: ["items"],
};

const PROMPT = `あなたはレシート画像から家計簿アプリ用の情報を抽出するアシスタントです。
添付されたレシート画像を読み取り、指定されたJSONスキーマに従って出力してください。

- payeeName: レシートに記載されている支払い先名。読み取れない場合はnull。
- datetime: レシートに記載されている購入日時。「YYYY-MM-DDTHH:mm」形式で出力する。時刻が読み取れない場合は00:00を補う。日付自体が読み取れない場合はnull。
- items: 購入した商品ごとに name（商品名）、price（その商品の行にレシート上で印字されている金額。税込表示でも税別表示でもそのまま転記し、税率を使った換算・計算は絶対に行わないこと）、discount（その商品に適用された値引き額。値引きがなければnull）、taxRatePercent（商品名から推定した消費税率。軽減税率対象なら8、標準税率なら10、判断できなければnull。これはあくまで参考情報であり、priceの計算には使用しないこと）を整数で出力する。price は値引きを差し引かず、値引き額は discount に分けて出力すること。小計行・合計行・お預かり/お釣りの行は items に含めない。
- totalPrice: レシートに記載されている合計金額（税込・整数）。読み取れない場合はnull。

画像がレシートでない、または情報を読み取れない場合は、items を空配列にしてください。`;

type RawOcrResponse = {
  payeeName?: string | null;
  datetime?: string | null;
  totalPrice?: number | null;
  items?: {
    name?: string;
    price?: number;
    discount?: number | null;
    taxRatePercent?: number | null;
  }[];
};

// 8/10以外の値が返った場合は信頼せずnull扱いにする（要件定義書20章：
// 税率の最終確定はユーザーが行う。ここでの推定は初期値の提案に過ぎない）。
function normalizeTaxRatePercent(value: number | null | undefined): 8 | 10 | null {
  return value === 8 || value === 10 ? value : null;
}

export async function extractReceiptFromImage(
  base64Image: string,
  mimeType: string
): Promise<OcrReceiptResult> {
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPT }, { inlineData: { data: base64Image, mimeType } }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: RECEIPT_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Geminiからの応答が空です。");
  }

  const parsed = JSON.parse(text) as RawOcrResponse;

  return {
    payeeName: parsed.payeeName ?? null,
    datetime: parsed.datetime ?? null,
    totalPrice:
      typeof parsed.totalPrice === "number" ? Math.round(parsed.totalPrice) : null,
    items: (parsed.items ?? [])
      .filter((item) => item && item.name)
      .map((item) => {
        const price = typeof item.price === "number" ? Math.round(item.price) : 0;
        const discount =
          typeof item.discount === "number" ? Math.round(item.discount) : 0;
        // Geminiには値引き前の価格と値引き額を別々に出力させ、
        // 引き算はコード側で行うことでLLMの計算誤りを避ける。
        return {
          name: item.name ?? "",
          price: discount > 0 ? price - discount : price,
          taxRatePercent: normalizeTaxRatePercent(item.taxRatePercent),
        };
      }),
  };
}
