"use client";

import { useRouter } from "next/navigation";

// 分析画面から絞り込み一覧に移ってきたときの「← 分析に戻る」。
// ブラウザの「戻る」と同じ動きにし、タップしたときの状態（表示対象・月など）の分析画面に戻す
// （分析画面は状態をURLから読み直す。詳細設計書 フェーズ3 4章）。
// スマホではブラウザの戻るボタンが押しにくいため、画面内にも用意する。
export function BackToAnalyticsButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="self-start text-sm text-slate-500 hover:text-slate-700"
    >
      ← 分析に戻る
    </button>
  );
}
