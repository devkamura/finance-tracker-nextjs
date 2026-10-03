"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 設定画面のタブ（docs/分析拡充/基本設計書.md 2.2節）
const TABS = [
  { href: "/settings/categories", label: "カテゴリ" },
  { href: "/settings/counterparts", label: "相手" },
  { href: "/settings/tags", label: "タグ" },
  { href: "/settings/payees", label: "支払い先" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="設定の項目" className="flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              active
                ? "border-indigo-600 font-bold text-indigo-700"
                : "border-transparent font-medium text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
