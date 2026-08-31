import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faSortAmountDown,
  faSortAmountUp,
} from "@fortawesome/free-solid-svg-icons";

import { ReceiptAccordionItem } from "@/components/receipt-list/ReceiptAccordionItem";
import { MonthSelector } from "@/components/ui/MonthSelector";
import {
  listReceipts,
  monthPeriod,
  parseMonthParam,
  retentionMonthRange,
  toMonthParam,
} from "@/lib/receipts/queries";
import { isMonthConfirmed } from "@/lib/settlement/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; sort?: string; open?: string }>;
}) {
  const {
    month: monthParam,
    sort: sortParam,
    open: openReceiptId,
  } = await searchParams;
  const targetDate = parseMonthParam(monthParam);
  const month = toMonthParam(targetDate);
  const sort: "asc" | "desc" = sortParam === "asc" ? "asc" : "desc";

  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const period = monthPeriod(targetDate);
  const [receipts, confirmed] = await Promise.all([
    listReceipts(supabase, membership!.groupId, period, sort),
    isMonthConfirmed(supabase, membership!.groupId, targetDate),
  ]);
  const { min, max } = retentionMonthRange();

  const sortToggleParams = new URLSearchParams({
    month,
    sort: sort === "asc" ? "desc" : "asc",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">レシート一覧</h1>
        <Link
          href="/"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          + 新しいレシートを登録
        </Link>
      </div>

      <MonthSelector
        basePath="/receipts"
        month={month}
        extraParams={{ sort }}
        minMonth={toMonthParam(min)}
        maxMonth={toMonthParam(max)}
      />

      {confirmed && (
        <Link
          href="/settlement"
          className="mx-auto flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <FontAwesomeIcon icon={faCircleCheck} />
          この月の精算は確定済みです（編集・削除不可）
        </Link>
      )}

      <div className="flex items-center justify-end">
        <Link
          href={`/receipts?${sortToggleParams.toString()}`}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <FontAwesomeIcon icon={sort === "asc" ? faSortAmountUp : faSortAmountDown} />
          {sort === "asc" ? "古い順" : "新しい順"}（切り替え）
        </Link>
      </div>

      {receipts.length === 0 ? (
        <p className="text-sm text-slate-500">
          この月に登録されたレシートはまだありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {receipts.map((receipt) => (
            <ReceiptAccordionItem
              key={receipt.id}
              receipt={receipt}
              detailHref={`/receipts/${receipt.id}?month=${month}&sort=${sort}`}
              initiallyOpen={receipt.id === openReceiptId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
