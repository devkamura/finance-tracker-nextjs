"use client";

import type { AnalyticsMember } from "@/lib/analytics/types";
import { getUserBadgeClass } from "@/lib/user-colors";

type ScopeSelectorProps = {
  members: AnalyticsMember[];
  scopeUserId: string | null; // null＝全体
  includeJoint: boolean;
  onChangeScope: (userId: string | null) => void;
  onChangeIncludeJoint: (value: boolean) => void;
};

// 表示対象（全体／メンバー）の切り替えと、メンバー選択時の「共同を含める」トグル
// （基本設計書3.2節）。メンバーのボタンは選択の有無にかかわらず管理画面で設定した色で表示し、
// 選択中のボタンはリングと太字で区別する（色だけに頼らない）。
export function ScopeSelector({
  members,
  scopeUserId,
  includeJoint,
  onChangeScope,
  onChangeIncludeJoint,
}: ScopeSelectorProps) {
  const baseClass =
    "rounded-full border px-3 py-1 text-sm transition-colors";
  const unselectedClass =
    "border-slate-200 bg-white font-medium text-slate-500 hover:bg-slate-50";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="表示対象">
        <button
          type="button"
          aria-pressed={scopeUserId === null}
          onClick={() => onChangeScope(null)}
          className={`${baseClass} ${
            scopeUserId === null
              ? "border-slate-700 bg-slate-700 font-bold text-white"
              : unselectedClass
          }`}
        >
          全体
        </button>
        {members.map((member) => {
          const selected = scopeUserId === member.userId;
          return (
            <button
              key={member.userId}
              type="button"
              aria-pressed={selected}
              onClick={() => onChangeScope(member.userId)}
              className={`${baseClass} ${
                getUserBadgeClass(member.color)
              } ${selected ? "font-bold ring-2 ring-slate-500 ring-offset-1" : "font-medium opacity-80 hover:opacity-100"}`}
            >
              {member.displayName}
            </button>
          );
        })}
      </div>

      {scopeUserId !== null && (
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeJoint}
            onChange={(e) => onChangeIncludeJoint(e.target.checked)}
            className="h-4 w-4"
          />
          共同を含める（1/2）
        </label>
      )}
    </div>
  );
}
