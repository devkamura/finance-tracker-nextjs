"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { recordPrevPath } from "@/lib/navigation/history-state";

// 画面を移るたびに、移動先の履歴エントリへ「直前にいた画面のパス」を記録する
// （共通の「戻る」ボタン BackLink が、1つ前に戻るかリンクで開くかを決めるのに使う）。
// ブラウザの戻る・進むで移ったときは、その画面の記録が残っているため書き換えない。
// 判定は画面の種類（パス）が変わったときだけ行う。同じ画面でクエリだけが変わった移動
// （月の切り替えなど）では記録しないため、その画面の「戻る」はリンクとして開く（安全側）。
export function NavigationTracker() {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const poppedRef = useRef(false);

  useEffect(() => {
    // popstate（ブラウザの戻る・進む、router.back）はパスの更新より先に発生する
    const onPopState = () => {
      poppedRef.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    if (poppedRef.current) {
      poppedRef.current = false;
    } else if (previousPath !== null && previousPath !== pathname) {
      recordPrevPath(previousPath);
    }
    previousPathRef.current = pathname;
  }, [pathname]);

  return null;
}
