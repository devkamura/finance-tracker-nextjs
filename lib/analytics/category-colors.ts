// グラフで使うカテゴリの色（docs/支出分析機能/詳細設計書.md 6.3節）。
// メンバーの色（ブルー／レッド）・共同の色（濃いグレー）と紛れないよう、
// 青系・赤系・グレーを除いた12色を使う。Rechartsのfillに直接渡すためhex値で持つ。
export const CATEGORY_PALETTE = [
  "#f97316", // オレンジ
  "#f59e0b", // アンバー
  "#eab308", // イエロー
  "#84cc16", // ライム
  "#22c55e", // グリーン
  "#10b981", // エメラルド
  "#14b8a6", // ティール
  "#8b5cf6", // バイオレット
  "#a855f7", // パープル
  "#d946ef", // フクシア
  "#92400e", // ブラウン
  "#4d7c0f", // オリーブ
] as const;

// カテゴリの色を返す。カテゴリに色が設定されていればそれを使い、なければ
// カテゴリID順（categoriesは呼び出し側でid昇順に並べて渡す）でパレットを割り当てる。
// 13番目以降は先頭の色に戻る（重複は許容）。
// 月や表示対象を切り替えても同じカテゴリが同じ色になるよう、並び順は全カテゴリで決める。
export function categoryColor(
  categoryId: number,
  categories: { id: number; color?: string | null }[]
): string {
  const index = categories.findIndex((c) => c.id === categoryId);
  const category = categories[index];
  if (category?.color) {
    return category.color;
  }
  return CATEGORY_PALETTE[Math.max(index, 0) % CATEGORY_PALETTE.length];
}
