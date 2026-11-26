// レシート単位の「特別費」の印の文言（Issue #41 要件6）。
// 明細ごとの印（ReceiptItemBadges）だけでは、一覧でどのレシートに特別費があるか分からないため、
// レシートの見出し（一覧の行・詳細の見出し）にも印を出す。
// 一部の明細だけが特別費のレシート（例：お土産と野菜）は、レシート全体が特別費に見えないよう「特別費あり」にする。

type ItemFlag = { isSpecialExpense: boolean };

// すべての明細が特別費 →「特別費」、一部だけ →「特別費あり」、ない（明細なしを含む）→ null
export function specialExpenseReceiptLabel(items: ItemFlag[]): "特別費" | "特別費あり" | null {
  const count = items.filter((item) => item.isSpecialExpense).length;
  if (count === 0) return null;
  return count === items.length ? "特別費" : "特別費あり";
}
