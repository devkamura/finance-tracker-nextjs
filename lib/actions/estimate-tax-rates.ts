"use server";

import { estimateTaxRatesForItemNames } from "@/lib/gemini/estimate-tax-rate";
import { createClient } from "@/lib/supabase/server";

export type EstimateTaxRatesResult =
  | { success: true; data: (8 | 10 | null)[] }
  | { success: false; error: string };

// 手動入力の明細に対して、商品名から消費税率(8%/10%)を推定する。
// 既存のOCR抽出（extractReceiptOcr）と同じくGemini APIを利用するため、
// 認証チェックも同様に行う。
export async function estimateReceiptItemTaxRates(
  itemNames: string[]
): Promise<EstimateTaxRatesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "ログインが必要です。" };
  }

  if (itemNames.length === 0) {
    return { success: true, data: [] };
  }

  try {
    const data = await estimateTaxRatesForItemNames(itemNames);
    return { success: true, data };
  } catch (e) {
    console.error("Failed to estimate tax rates via Gemini", e);
    return { success: false, error: "税率の推定に失敗しました。" };
  }
}
