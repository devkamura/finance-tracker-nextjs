"use client";

import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

type TooltipProps = {
  // 説明文。箇条書き等を表示したい場合はReactノードも渡せる。
  text: ReactNode;
  // 吹き出しの横位置。画面右端付近に置く場合は"end"、左端付近に置く場合は"start"にしてはみ出しを防ぐ。
  align?: "center" | "start" | "end";
};

// 用語説明用の「?」アイコン。クリック/タップで開閉するため、
// ホバーが効かないスマートフォンでも利用できる。
export function Tooltip({ text, align = "center" }: TooltipProps) {
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
        <span
          className={`absolute bottom-full z-10 mb-2 w-48 ${
            align === "end" ? "right-0" : align === "start" ? "left-0" : "left-1/2 -translate-x-1/2"
          } rounded-lg bg-slate-800 px-3 py-2 text-left text-xs font-normal text-white shadow-lg`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
