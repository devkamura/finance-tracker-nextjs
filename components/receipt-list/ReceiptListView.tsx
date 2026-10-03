"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faSortAmountDown,
  faSortAmountUp,
} from "@fortawesome/free-solid-svg-icons";

import { ReceiptAccordionItem } from "@/components/receipt-list/ReceiptAccordionItem";
import { ReceiptFilterBanner } from "@/components/receipt-list/ReceiptFilterBanner";
import { MonthSelector } from "@/components/ui/MonthSelector";
import { parseDrilldownSource, parseListFilter, withQuery } from "@/lib/receipts/list-params";
import { buildReceiptListView, type ReceiptSort } from "@/lib/receipts/list-view";
import type { ReceiptListItem } from "@/types/receipt";

type ReceiptListViewProps = {
  receipts: ReceiptListItem[]; // その月のレシートすべて（絞り込み前）
  categories: { id: number; name: string }[];
  members: { userId: string; displayName: string }[];
  month: string; // "YYYY-MM"
  minMonth: string;
  maxMonth: string;
  confirmed: boolean;
  openReceiptId: string | null;
};

// 絞り込み条件のURLパラメータ（解除するとまとめて外す）
type FilterParams = { category?: string; scope?: string; joint?: string };

// レシート一覧の表示部分（詳細設計書 フェーズ3 5章）。
// その月のレシートはサーバーから1回だけ受け取り、絞り込み・解除・並び替えは画面側だけで行う
// （サーバー通信なし）。月の切り替えだけは別の月のデータが必要なため、サーバーから取得する。
export function ReceiptListView({
  receipts,
  categories,
  members,
  month,
  minMonth,
  maxMonth,
  confirmed,
  openReceiptId,
}: ReceiptListViewProps) {
  const searchParams = useSearchParams();
  // 初期状態は現在のURLから読む。詳細画面からブラウザの「戻る」で戻ったときも、
  // replaceStateで保存した並び順・絞り込みから復元できるようにする（分析画面と同じ考え方）。
  const [sort, setSort] = useState<ReceiptSort>(() =>
    searchParams.get("sort") === "asc" ? "asc" : "desc"
  );
  const [filterParams, setFilterParams] = useState<FilterParams | null>(() => {
    const params = {
      category: searchParams.get("category") ?? undefined,
      scope: searchParams.get("scope") ?? undefined,
      joint: searchParams.get("joint") ?? undefined,
    };
    return params.category || params.scope ? params : null;
  });
  // 移動元（分析画面）は絞り込みを解除しても残す（「← 分析に戻る」を出し続けるため）
  const from = parseDrilldownSource({ from: searchParams.get("from") ?? undefined });

  const filter = useMemo(
    () => (filterParams ? parseListFilter(filterParams, categories, members) : null),
    [filterParams, categories, members]
  );
  const view = useMemo(
    () => buildReceiptListView(receipts, filter, sort),
    [receipts, filter, sort]
  );

  // 月・並び順・絞り込み・移動元をまとめたURLパラメータ。
  // URLへの反映、詳細画面へのリンク、月の切り替え先で共通に使う。
  const listParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("month", month);
    params.set("sort", sort);
    if (filterParams) {
      for (const [key, value] of Object.entries(filterParams)) {
        if (value) params.set(key, value);
      }
    }
    if (from) params.set("from", from);
    return params;
  }, [month, sort, filterParams, from]);

  // 状態をURLに反映する。履歴には積まない（解除してからブラウザの「戻る」を押すと、
  // 解除の取り消しではなく、一覧に来る前の画面に戻る。詳細設計書 フェーズ3 確認事項）。
  // openは詳細画面から戻ったときに一度だけ使う指定のため、残さない。
  useEffect(() => {
    window.history.replaceState(null, "", withQuery("/receipts", listParams));
  }, [listParams]);

  const monthSelectorExtraParams = Object.fromEntries(
    Array.from(listParams.entries()).filter(([key]) => key !== "month")
  );

  return (
    <>
      <MonthSelector
        basePath="/receipts"
        month={month}
        extraParams={monthSelectorExtraParams}
        minMonth={minMonth}
        maxMonth={maxMonth}
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

      {filter && (
        <ReceiptFilterBanner
          categoryName={filter.categoryName}
          scopeLabel={filter.scopeLabel}
          total={view.matchedTotal}
          onClear={() => setFilterParams(null)}
        />
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setSort((prev) => (prev === "asc" ? "desc" : "asc"))}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <FontAwesomeIcon icon={sort === "asc" ? faSortAmountUp : faSortAmountDown} />
          {sort === "asc" ? "古い順" : "新しい順"}（切り替え）
        </button>
      </div>

      {view.items.length === 0 ? (
        <p className="text-sm text-slate-500">
          {filter
            ? "この条件に当てはまるレシートはありません。"
            : "この月に登録されたレシートはまだありません。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.items.map(({ receipt, match }) => (
            <ReceiptAccordionItem
              key={receipt.id}
              receipt={receipt}
              detailHref={withQuery(`/receipts/${receipt.id}`, listParams)}
              initiallyOpen={receipt.id === openReceiptId}
              match={
                filter && match
                  ? {
                      label: filter.categoryName ?? "該当分",
                      amount: match.matchedAmount,
                      itemIds: match.matchedItemIds,
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
