import "server-only";

import { GoogleGenAI, Type } from "@google/genai";

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
            description: "その商品の税込価格（整数）。値引き前の金額をそのまま出力する。",
          },
          discount: {
            type: Type.INTEGER,
            nullable: true,
            description:
              "その商品に適用された値引き額（整数）。値引きがない場合はnull。",
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
- items: 購入した商品ごとに name（商品名）、price（税込・値引き前の金額）、discount（その商品に適用された値引き額。値引きがなければnull）を整数で出力する。price は値引きを差し引かず、値引き額は discount に分けて出力すること。小計行・合計行・お預かり/お釣りの行は items に含めない。
- totalPrice: レシートに記載されている合計金額（税込・整数）。読み取れない場合はnull。

画像がレシートでない、または情報を読み取れない場合は、items を空配列にしてください。`;

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!cachedClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEYが設定されていません。");
    }
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

type RawOcrResponse = {
  payeeName?: string | null;
  datetime?: string | null;
  totalPrice?: number | null;
  items?: { name?: string; price?: number; discount?: number | null }[];
};

export async function extractReceiptFromImage(
  base64Image: string,
  mimeType: string
): Promise<OcrReceiptResult> {
  const ai = getClient();

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
        };
      }),
  };
}
