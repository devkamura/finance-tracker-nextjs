"use client";

import { useState } from "react";
import Link from "next/link";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faGear,
  faListUl,
  faRightFromBracket,
  faScaleBalanced,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

type HeaderNavProps = {
  displayName: string;
  isAdmin: boolean;
  onLogout: () => Promise<void>;
};

// sm未満（スマートフォン幅）では横並びナビが情報過多で潰れるため、
// ハンバーガーメニューに切り替える。sm以上は従来どおり横並び表示のまま。
export function HeaderNav({ displayName, isAdmin, onLogout }: HeaderNavProps) {
  const [open, setOpen] = useState(false);

  const navLinkClass =
    "flex items-center gap-2 hover:text-slate-900";

  return (
    <div className="relative">
      <div className="hidden items-center gap-3 text-sm text-slate-600 sm:flex">
        <span>{displayName}</span>
        <Link href="/receipts" className={navLinkClass}>
          <FontAwesomeIcon icon={faListUl} />
          一覧
        </Link>
        <Link href="/settlement" className={navLinkClass}>
          <FontAwesomeIcon icon={faScaleBalanced} />
          精算
        </Link>
        {isAdmin && (
          <Link href="/admin" className={navLinkClass}>
            <FontAwesomeIcon icon={faGear} />
            管理画面
          </Link>
        )}
        <form action={onLogout}>
          <button
            type="submit"
            className="flex items-center gap-1 text-slate-500 hover:text-slate-800"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
            ログアウト
          </button>
        </form>
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "メニューを閉じる" : "メニューを開く"}
        aria-expanded={open}
        className="flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:hidden"
      >
        <FontAwesomeIcon icon={open ? faXmark : faBars} className="text-lg" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:hidden">
          <div className="border-b border-slate-100 pb-2 text-sm font-medium text-slate-900">
            {displayName}
          </div>
          <nav className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
            <Link
              href="/receipts"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 hover:text-slate-900"
            >
              <FontAwesomeIcon icon={faListUl} />
              一覧
            </Link>
            <Link
              href="/settlement"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 hover:text-slate-900"
            >
              <FontAwesomeIcon icon={faScaleBalanced} />
              精算
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 hover:text-slate-900"
              >
                <FontAwesomeIcon icon={faGear} />
                管理画面
              </Link>
            )}
            <form action={onLogout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                <FontAwesomeIcon icon={faRightFromBracket} />
                ログアウト
              </button>
            </form>
          </nav>
        </div>
      )}
    </div>
  );
}
