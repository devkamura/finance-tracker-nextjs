"use client";

import { useState, useTransition } from "react";

import { updateMemberColor } from "@/lib/actions/update-member-color";
import {
  USER_COLORS,
  USER_COLOR_LABELS,
  getUserSwatchClass,
  type UserColor,
} from "@/lib/user-colors";

type MemberColorPickerProps = {
  userId: string;
  initialColor: string | null;
};

// 管理者が自グループのメンバーの表示色を選択する。選択した色は
// 支払者・帰属先などユーザー名を表示する箇所（UserBadge）に反映される。
export function MemberColorPicker({
  userId,
  initialColor,
}: MemberColorPickerProps) {
  const [color, setColor] = useState<string | null>(initialColor);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const pick = (next: string | null) => {
    startTransition(async () => {
      const result = await updateMemberColor(userId, next);
      if (result.success) {
        setColor(result.color);
        setOpen(false);
      }
    });
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={isPending}
        aria-label="表示色を選択"
        className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
      >
        <span
          className={`h-3.5 w-3.5 rounded-full border border-slate-300 ${
            color ? getUserSwatchClass(color as UserColor) : "bg-white"
          }`}
        />
        色
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 grid w-40 grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <button
            type="button"
            onClick={() => pick(null)}
            title="色なし"
            aria-label="色なし"
            className={`h-6 w-6 rounded-full border border-slate-300 bg-white ${
              color === null ? "ring-2 ring-offset-1 ring-slate-400" : ""
            }`}
          />
          {USER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              title={USER_COLOR_LABELS[c]}
              aria-label={USER_COLOR_LABELS[c]}
              className={`h-6 w-6 rounded-full ${getUserSwatchClass(c)} ${
                color === c ? "ring-2 ring-offset-1 ring-slate-500" : ""
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
