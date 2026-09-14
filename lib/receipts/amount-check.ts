// レシートの合計金額（支払額）と、各明細から計算した税込合計との整合性チェック。
// OCR・手動入力どちらの入力経路でも、送信ボタン押下時に同じロジックで検証する
// （ReceiptFormState単位で完結する純粋関数のため、クライアント側でも安全に実行できる）。
//
// 注：要件定義書21〜22章により、ポイント・クーポン等で明細合計と支払額が
// 一致しないことは正常な状態として許容されている。そのためこのチェックは
// 入力ミスに気付けるようモーダルで警告するのみとし、保存自体はブロックしない。

import type { ReceiptItem } from "@/types/receipt";

type TaxRateMaster = { id: number; multiplier: number };

// 税別明細は、インボイス制度（適格請求書等保存方式）の端数処理ルールに合わせ、
// 明細1件ごとではなく同一税率の小計に対して1回だけ端数処理する（積み上げ計算だと
// 実際のレシートの合計額と数円ズレることがあるため）。
export function calculateItemsTaxInclusiveTotal(
  items: ReceiptItem[],
  taxRates: TaxRateMaster[]
): number {
  let total = 0;
  const exclusiveSubtotalsByRateId = new Map<string, number>();

  for (const item of items) {
    const price = Number(item.price);
    if (!Number.isFinite(price)) {
      continue;
    }
    if (item.taxType === "inclusive") {
      total += price;
      continue;
    }
    const taxRate = taxRates.find((t) => String(t.id) === item.taxRateId);
    if (!taxRate) {
      // 税率未選択（バリデーションエラーで別途弾かれる想定）の場合は
      // 入力された価格をそのまま税込扱いとして扱う。
      total += price;
      continue;
    }
    const key = String(taxRate.id);
    exclusiveSubtotalsByRateId.set(
      key,
      (exclusiveSubtotalsByRateId.get(key) ?? 0) + price
    );
  }

  for (const [rateId, subtotal] of exclusiveSubtotalsByRateId) {
    const taxRate = taxRates.find((t) => String(t.id) === rateId);
    if (!taxRate) continue;
    total += Math.floor(subtotal * taxRate.multiplier);
  }

  return total;
}

// 合計金額（支払額）と明細合計が一致しているかを判定する。
export function isAmountConsistent(
  amount: string,
  items: ReceiptItem[],
  taxRates: TaxRateMaster[]
): boolean {
  const total = calculateItemsTaxInclusiveTotal(items, taxRates);
  return Number(amount) === total;
}
