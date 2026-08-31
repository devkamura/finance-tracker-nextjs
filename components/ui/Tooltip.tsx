"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

type TooltipProps = {
  text: string;
};

// 用語説明用の「?」アイコン。クリック/タップで開閉するため、
// ホバーが効かないスマートフォンでも利用できる。
export function Tooltip({ text }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => setOpen(false)}
        aria-label="説明を表示"
        className="text-slate-400 hover:text-slate-600"
      >
        <FontAwesomeIcon icon={faCircleInfo} className="text-xs" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-left text-xs font-normal text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}
