// レシートの合計金額（支払額）と、各明細から計算した税込合計との整合性チェック。
// OCR・手動入力どちらの入力経路でも、送信ボタン押下時に同じロジックで検証する
// （ReceiptFormState単位で完結する純粋関数のため、クライアント側でも安全に実行できる）。
//
// 注：要件定義書21〜22章により、ポイント・クーポン等で明細合計と支払額が
// 一致しないことは正常な状態として許容されている。そのためこのチェックは
// 入力ミスに気付けるようモーダルで警告するのみとし、保存自体はブロックしない。

import type { ReceiptItem } from "@/types/receipt";

type TaxRateMaster = { id: number; multiplier: number };

// 明細1件の税込換算額を計算する（精算計算 lib/settlement/calculate.ts の
// taxInclusiveAmountと同じ考え方：税別明細は乗率を掛けて切り捨てる）。
function itemTaxInclusiveAmount(
  item: ReceiptItem,
  taxRates: TaxRateMaster[]
): number {
  const price = Number(item.price);
  if (!Number.isFinite(price)) {
    return 0;
  }
  if (item.taxType === "inclusive") {
    return price;
  }
  const taxRate = taxRates.find((t) => String(t.id) === item.taxRateId);
  if (!taxRate) {
    // 税率未選択（バリデーションエラーで別途弾かれる想定）の場合は
    // 入力された価格をそのまま税込扱いとして扱う。
    return price;
  }
  return Math.floor(price * taxRate.multiplier);
}

export function calculateItemsTaxInclusiveTotal(
  items: ReceiptItem[],
  taxRates: TaxRateMaster[]
): number {
  return items.reduce(
    (sum, item) => sum + itemTaxInclusiveAmount(item, taxRates),
    0
  );
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
