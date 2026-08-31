"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";

import { ReceiptItemBadges } from "@/components/receipt-detail/ReceiptItemBadges";
import { UserBadge } from "@/components/ui/UserBadge";
import type { ReceiptListItem } from "@/types/receipt";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ReceiptAccordionItemProps = {
  receipt: ReceiptListItem;
  detailHref: string;
  initiallyOpen: boolean;
};

// 一覧の各行。タップで明細をその場（アコーディオン）に展開して確認できる。
// 画像・編集・削除は詳細画面（/receipts/[id]）で行う
// （画像は一覧では表示しない。詳細画面遷移後のみ確認できる）。
export function ReceiptAccordionItem({
  receipt,
  detailHref,
  initiallyOpen,
}: ReceiptAccordionItemProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const ref = useRef<HTMLLIElement>(null);

  // 詳細画面から戻ってきた直後は、遷移前に開いていた行までスクロールする。
  useEffect(() => {
    if (initiallyOpen) {
      ref.current?.scrollIntoView({ block: "center" });
    }
    // 初回マウント時のみ実行すればよい。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <li ref={ref} className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm text-slate-500">
            {formatDateTime(receipt.occurredAt)}
            {receipt.transactionTypeName === "返金" && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                返金
              </span>
            )}
          </span>
          <span className="truncate font-medium text-slate-900">
            {receipt.payeeName || "（支払い先未入力）"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-semibold text-slate-900">
              {receipt.amount.toLocaleString()}円
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              支払者:
              <UserBadge name={receipt.payerDisplayName} color={receipt.payerColor} />
            </span>
          </div>
          <FontAwesomeIcon
            icon={open ? faChevronUp : faChevronDown}
            className="text-slate-400"
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <ul className="divide-y divide-slate-100">
            {receipt.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2">
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

          <Link
            href={detailHref}
            className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            詳細を見る（画像・編集・削除はこちら）→
          </Link>
        </div>
      )}
    </li>
  );
}
