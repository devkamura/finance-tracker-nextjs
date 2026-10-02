"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import { formatYen } from "@/lib/analytics/aggregate";

type NegativeAmountNoticeProps = {
  subject: "カテゴリ" | "月"; // 円グラフはカテゴリ、推移グラフは月がマイナスになる
  negatives: { name: string; amount: number }[];
  // 円グラフの％の説明（円グラフを描いているときのみ渡す）
  ratio?: { positiveTotal: number; total: number };
};

// 返金が支出を上回りマイナスになったカテゴリ・月があるときの注意書き（基本設計書3.7節、必須）。
// マイナスがなければ何も表示しない。
export function NegativeAmountNotice({ subject, negatives, ratio }: NegativeAmountNoticeProps) {
  if (negatives.length === 0) {
    return null;
  }

  const list = negatives.map((n) => `${n.name} ${formatYen(n.amount)}`).join("、");

  return (
    <div
      role="note"
      className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
    >
      <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p>
          返金が支出を上回った{subject}は、グラフ上0として表示しています（{list}）。
        </p>
        {ratio && (
          <p>
            割合は、マイナスのカテゴリを除いた合計（{formatYen(ratio.positiveTotal)}
            ）に対する値です。実際の合計は{formatYen(ratio.total)}です。
          </p>
        )}
      </div>
    </div>
  );
}
