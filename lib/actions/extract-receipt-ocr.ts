"use server";

import { OCR_ALLOWED_MIME_TYPES } from "@/lib/constants";
import { extractReceiptFromImage } from "@/lib/gemini/extract-receipt";
import { createClient } from "@/lib/supabase/server";
import type { OcrReceiptResult } from "@/types/receipt";

export type ExtractReceiptOcrResult =
  | { success: true; data: OcrReceiptResult }
  | { success: false; error: string };

export async function extractReceiptOcr(
  formData: FormData
): Promise<ExtractReceiptOcrResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { success: false, error: "画像を選択してください。" };
  }
  if (!OCR_ALLOWED_MIME_TYPES.includes(image.type)) {
    return {
      success: false,
      error: "対応していない画像形式です（PNG / JPG / JPEG / HEIC / HEIFのみ）。",
    };
  }

  try {
    const arrayBuffer = await image.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const data = await extractReceiptFromImage(base64Image, image.type);
    return { success: true, data };
  } catch (e) {
    console.error("Failed to extract receipt via Gemini", e);
    return { success: false, error: "レシート画像の読み取りに失敗しました。" };
  }
}
