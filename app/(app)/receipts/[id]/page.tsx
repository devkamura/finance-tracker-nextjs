import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteReceiptButton } from "@/components/receipt-detail/DeleteReceiptButton";
import { ReceiptImagePreview } from "@/components/receipt-detail/ReceiptImagePreview";
import { ReceiptItemBadges } from "@/components/receipt-detail/ReceiptItemBadges";
import { UserBadge } from "@/components/ui/UserBadge";
import { getReceiptDetail } from "@/lib/receipts/queries";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function ReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; sort?: string }>;
}) {
  const { id } = await params;
  const { month, sort } = await searchParams;

  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const receipt = await getReceiptDetail(supabase, membership!.groupId, id);
  if (!receipt) {
    notFound();
  }

  // 一覧のどの月・並び順から遷移してきたかを維持しつつ、この行を開いた状態で
  // 一覧に戻れるようにする（open=id）。削除時は開き直す対象が消えるのでopenは付けない。
  const listParams = new URLSearchParams();
  if (month) listParams.set("month", month);
  if (sort) listParams.set("sort", sort);
  const backParams = new URLSearchParams(listParams);
  backParams.set("open", id);
  const editHref = `/receipts/${id}/edit?${new URLSearchParams(
    month || sort ? { ...(month ? { month } : {}), ...(sort ? { sort } : {}) } : {}
  ).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/receipts?${backParams.toString()}`}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← レシート一覧に戻る
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">
              {formatDateTime(receipt.occurredAt)}
              {receipt.transactionTypeName === "返金" && (
                <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                  返金
                </span>
              )}
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              {receipt.payeeName || "（支払い先未入力）"}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">
              {receipt.amount.toLocaleString()}円
            </p>
            <p className="flex items-center justify-end gap-1 text-xs text-slate-500">
              支払者:
              <UserBadge name={receipt.payerDisplayName} color={receipt.payerColor} />
            </p>
          </div>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-700">明細</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {receipt.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {item.itemName || "（品目未入力）"}
                </p>
                <ReceiptItemBadges item={item} />
              </div>
              <span className="shrink-0 text-sm font-medium text-slate-900">
                {item.price.toLocaleString()}円
              </span>
            </li>
          ))}
        </ul>

        {receipt.receiptImageUrl && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-700">
              レシート画像
            </h2>
            <ReceiptImagePreview url={receipt.receiptImageUrl} />
          </div>
        )}

        {receipt.isLocked && (
          <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            この月の精算は確定済みのため、編集・削除できません。変更するには管理者に再オープンを依頼してください。
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Link
            href={editHref}
            aria-disabled={receipt.isLocked}
            className={`flex-1 rounded-lg border px-4 py-2 text-center text-sm font-medium ${
              receipt.isLocked
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            編集する
          </Link>
          <DeleteReceiptButton
            receiptId={receipt.id}
            disabled={receipt.isLocked}
            backHref={`/receipts?${listParams.toString()}`}
          />
        </div>
      </div>
    </div>
  );
}
