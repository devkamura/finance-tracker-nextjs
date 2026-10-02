"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import { formatYen } from "@/lib/analytics/aggregate";

type NegativeAmountNoticeProps = {
  negatives: { name: string; amount: number }[];
  hasPie: boolean; // 円グラフを描いているか（％の説明を出すかどうか）
  positiveTotal: number;
  total: number;
};

// 返金が支出を上回りマイナスになったカテゴリがあるときの注意書き（基本設計書3.7節、必須）。
// マイナスのカテゴリがなければ何も表示しない。
export function NegativeAmountNotice({
  negatives,
  hasPie,
  positiveTotal,
  total,
}: NegativeAmountNoticeProps) {
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
        <p>返金が支出を上回ったカテゴリは、グラフ上0として表示しています（{list}）。</p>
        {hasPie && (
          <p>
            割合は、マイナスのカテゴリを除いた合計（{formatYen(positiveTotal)}
            ）に対する値です。実際の合計は{formatYen(total)}です。
          </p>
        )}
      </div>
    </div>
  );
}
