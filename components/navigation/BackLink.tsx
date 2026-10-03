"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getPrevPath, shouldGoBack } from "@/lib/navigation/history-state";

type BackLinkProps = {
  href: string; // 戻り先。直前にいた画面が別の場合や記録がない場合は、このURLを開く
  className?: string;
  children: ReactNode;
};

// アプリ共通の「戻る」ボタン（docs/支出分析機能/詳細設計書.md フェーズ3 4章）。
// 直前にいた画面が戻り先と同じなら1つ前に戻る（通信なし・その画面の状態もそのまま）。
// それ以外（URLを直接開いた、編集を保存した後など）は戻り先へのリンクとして開く。
// 戻り先の画面は状態をURLから復元するため、どちらの戻り方でも同じ状態で表示される。
export function BackLink({ href, className, children }: BackLinkProps) {
  const router = useRouter();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // 新しいタブで開く操作（Ctrl/⌘クリックなど）は、通常のリンクとして扱う
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (shouldGoBack(getPrevPath(), href)) {
      event.preventDefault();
      router.back();
    }
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      // 「戻る」ボタンは押したときだけ取得すればよいため先読みしない
      prefetch={false}
      className={className ?? "text-sm text-slate-500 hover:text-slate-700"}
    >
      {children}
    </Link>
  );
}
