"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";

type ReceiptFilterBannerProps = {
  // 条件の表示名（「食費 ＞ 外食」「負担者：A＋共同1/2」「支払者：B」「10/1〜10/7」「投資を除く」など）
  parts: string[];
  count: number; // 該当するレシートの件数
  onClear: () => void; // 絞り込みの解除（画面側だけで行い、サーバー通信はしない）
};

// 絞り込み中の表示（詳細設計書 フェーズ3 5.3節。Issue #39 でフィルタ欄の条件にも使う）。
// 一覧が画面の下に押し出されないよう、条件・件数・解除を1行にまとめる
// （条件が長いときは条件の部分だけ折り返す）。
// 合計は出さない（Issue #49）。一覧のフィルタと分析画面から来た条件とで、投資・特別費を含むかが
// 変わり、何の合計か分かりにくいため。合計は分析画面で見る。
// 解除は画面側だけで行う（同じ月のレシートは取得済みのため、サーバーへは取り直さない）。
export function ReceiptFilterBanner({ parts, count, onClear }: ReceiptFilterBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm">
      <FontAwesomeIcon icon={faFilter} className="shrink-0 text-xs text-indigo-400" />
      <span className="min-w-0 flex-1 font-medium text-indigo-900">{parts.join(" ／ ")}</span>
      <span className="shrink-0 text-slate-600">{count}件</span>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 rounded-md border border-indigo-200 bg-white px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
      >
        解除
      </button>
    </div>
  );
}
