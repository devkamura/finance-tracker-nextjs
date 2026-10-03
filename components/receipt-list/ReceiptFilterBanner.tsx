"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";

import { formatYen } from "@/lib/analytics/aggregate";

type ReceiptFilterBannerProps = {
  categoryName: string | null; // null＝総支出（全カテゴリ）
  scopeLabel: string; // 「全体」「A」「A＋共同1/2」
  total: number; // 該当分（按分後）の合計。分析画面のグラフの値と一致する
  onClear: () => void; // 絞り込みの解除（画面側だけで行い、サーバー通信はしない）
};

// 分析画面から移ってきたときの絞り込み中の表示（詳細設計書 フェーズ3 5.3節）。
// 絞り込みの条件と該当分の合計を示し、「解除」で通常の月別一覧に戻れるようにする。
// 解除は画面側だけで行う（同じ月のレシートは取得済みのため、サーバーへは取り直さない）。
export function ReceiptFilterBanner({
  categoryName,
  scopeLabel,
  total,
  onClear,
}: ReceiptFilterBannerProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-sm text-indigo-900">
          <FontAwesomeIcon icon={faFilter} className="text-xs" />
          <span className="font-medium">
            {categoryName ?? "総支出"} ／ {scopeLabel}
          </span>
          で絞り込み中
        </p>
        <p className="text-sm text-slate-700">
          {categoryName ? `${categoryName}の合計` : "該当の合計"}：
          <span className={`font-bold ${total < 0 ? "text-red-600" : "text-slate-900"}`}>
            {formatYen(total)}
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
      >
        解除
      </button>
    </div>
  );
}
