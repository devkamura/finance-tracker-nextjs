import { specialExpenseReceiptLabel } from "@/lib/receipts/special-expense-label";

// レシートの見出し（一覧の行・詳細の見出し）に出す「特別費」「特別費あり」の印（Issue #41 要件6）。
// 明細の「特別費」バッジ（ReceiptItemBadges）と同じ色にして、同じ意味だと分かるようにする。
export function SpecialExpenseReceiptBadge({ items }: { items: { isSpecialExpense: boolean }[] }) {
  const label = specialExpenseReceiptLabel(items);
  if (!label) return null;
  return (
    <span className="ml-2 inline-block whitespace-nowrap rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
      {label}
    </span>
  );
}
