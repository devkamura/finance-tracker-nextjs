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
import {
  costTypeMap,
  DIMENSIONS,
  type Dimension,
  type DimensionMaster,
} from "@/lib/analytics/dimensions";
import { replaceUrlKeepingAppState } from "@/lib/navigation/history-state";
import {
  parseDrilldownSource,
  parseListFilter,
  withQuery,
} from "@/lib/receipts/list-params";
import { buildReceiptListView, type ReceiptSort } from "@/lib/receipts/list-view";
import type { ReceiptListItem } from "@/types/receipt";

type ReceiptListViewProps = {
  receipts: ReceiptListItem[]; // その月のレシートすべて（絞り込み前）
  // 絞り込みの条件の名前・費用区分を求めるためのマスタ（カテゴリ・内訳・相手）
  master: DimensionMaster;
  members: { userId: string; displayName: string }[];
  month: string; // "YYYY-MM"
  minMonth: string;
  maxMonth: string;
  confirmed: boolean;
};

// 一覧のURLパラメータに、開いていた行（open）を加える
function urlParamsWithOpen(listParams: URLSearchParams, openReceiptId: string | null) {
  const params = new URLSearchParams(listParams);
  if (openReceiptId) params.set("open", openReceiptId);
  return params;
}

// 絞り込み条件のURLパラメータ（解除するとまとめて外す）
type FilterParams = Partial<Record<Dimension | "scope" | "joint", string>>;

const FILTER_PARAM_KEYS = [...DIMENSIONS, "scope", "joint"] as const;

// レシート一覧の表示部分（詳細設計書 フェーズ3 5章）。
// その月のレシートはサーバーから1回だけ受け取り、絞り込み・解除・並び替えは画面側だけで行う
// （サーバー通信なし）。月の切り替えだけは別の月のデータが必要なため、サーバーから取得する。
export function ReceiptListView({
  receipts,
  master,
  members,
  month,
  minMonth,
  maxMonth,
  confirmed,
}: ReceiptListViewProps) {
  const searchParams = useSearchParams();
  // 開いておく行も現在のURLから読む（詳細画面から「戻る」で戻ったとき、ページはキャッシュから
  // 再利用されるため、サーバーが最初に受け取った値ではなく、書き込んでおいたURLの値を使う）
  const [openReceiptId] = useState<string | null>(() => searchParams.get("open"));
  // 初期状態は現在のURLから読む。詳細画面からブラウザの「戻る」で戻ったときも、
  // replaceStateで保存した並び順・絞り込みから復元できるようにする（分析画面と同じ考え方）。
  const [sort, setSort] = useState<ReceiptSort>(() =>
    searchParams.get("sort") === "asc" ? "asc" : "desc"
  );
  const [filterParams, setFilterParams] = useState<FilterParams | null>(() => {
    const params: FilterParams = {};
    for (const key of FILTER_PARAM_KEYS) {
      const value = searchParams.get(key);
      if (value) params[key] = value;
    }
    // 条件（カテゴリ〜相手）または表示対象があるときだけ絞り込み中とする
    const filtering = DIMENSIONS.some((d) => params[d] !== undefined) || params.scope;
    return filtering ? params : null;
  });
  // 移動元（分析画面）と戻り先の分析画面の状態（ret）は、絞り込みを解除しても残す
  // （「← 分析に戻る」を出し続け、詳細画面への行き来でも引き継ぐため）
  const from = parseDrilldownSource({ from: searchParams.get("from") ?? undefined });
  const ret = searchParams.get("ret");

  const filter = useMemo(
    () => (filterParams ? parseListFilter(filterParams, master, members) : null),
    [filterParams, master, members]
  );
  const costTypes = useMemo(() => costTypeMap(master.categories), [master.categories]);
  const view = useMemo(
    () => buildReceiptListView(receipts, filter, sort, costTypes),
    [receipts, filter, sort, costTypes]
  );

  // 月・並び順・絞り込み・移動元をまとめたURLパラメータ。
  // URLへの反映、詳細画面へのリンク、月の切り替え先で共通に使う。
  const listParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("month", month);
    params.set("sort", sort);
    if (filterParams) {
      for (const [key, value] of Object.entries(filterParams)) {
        if (value !== undefined) params.set(key, value);
      }
    }
    if (from) params.set("from", from);
    if (from && ret) params.set("ret", ret);
    return params;
  }, [month, sort, filterParams, from, ret]);

  // 状態をURLに反映する。履歴には積まない（解除してからブラウザの「戻る」を押すと、
  // 解除の取り消しではなく、一覧に来る前の画面に戻る。詳細設計書 フェーズ3 確認事項）。
  // 開いていた行（open）もURLに残し、詳細画面から「戻る」で戻ったときにその行を開いた状態にする。
  // 直前の画面の記録（共通の戻るボタン用）を消さないよう、共通の処理で書き換える。
  useEffect(() => {
    replaceUrlKeepingAppState(withQuery("/receipts", urlParamsWithOpen(listParams, openReceiptId)));
  }, [listParams, openReceiptId]);

  // 「詳細を見る」を押した行を、詳細画面へ移る直前にURLへ書き込む（通信なし・履歴は増やさない）。
  // 詳細画面から1つ前に戻る（またはブラウザの戻る）と、一覧はURLからこの行を開いた状態で復元する。
  const rememberOpenRow = (receiptId: string) => {
    replaceUrlKeepingAppState(withQuery("/receipts", urlParamsWithOpen(listParams, receiptId)));
  };

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
          label={filter.label}
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
              onOpenDetail={() => rememberOpenRow(receipt.id)}
              match={
                filter && match
                  ? {
                      label: filter.label ?? "該当分",
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
