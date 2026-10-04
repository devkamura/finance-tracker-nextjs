import { BackLink } from "@/components/navigation/BackLink";

type BackToAnalyticsButtonProps = {
  href: string; // 移動元の分析画面（状態付き）のURL。buildAnalyticsReturnHrefで作る
};

// 分析画面から絞り込み一覧に移ってきたときの「← 分析に戻る」。
// 共通の戻るボタン（BackLink）を使い、分析画面から直接来たときは1つ前に戻る（通信なし）。
// 一覧 → 詳細 → 一覧（リンクで開き直した場合）など、直前が分析画面でないときは、
// タップしたときの状態（ret）の分析画面をリンクとして開く（詳細設計書 フェーズ3 4章）。
// スマホではブラウザの戻るボタンが押しにくいため、画面内にも用意する。
export function BackToAnalyticsButton({ href }: BackToAnalyticsButtonProps) {
  return (
    <BackLink href={href} className="self-start text-sm text-slate-500 hover:text-slate-700">
      ← 分析に戻る
    </BackLink>
  );
}
