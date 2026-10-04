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

// カテゴリ以外の項目（内訳・費用区分・支払い先・相手）の色（docs/分析拡充/詳細設計書.md F4 5章）。
// 並び順の何番目かでパレットの色を割り当てる。隣り合う色（オレンジとアンバー等）が続くと
// 見分けにくいため、パレットを5つ飛ばしで使う（12と5は互いに素のため、12色を1巡してから重なる）。
export function paletteColor(index: number): string {
  const safeIndex = Math.max(index, 0);
  return CATEGORY_PALETTE[(safeIndex * 5) % CATEGORY_PALETTE.length];
}

// 「内訳なし」の色。どの内訳とも紛れないよう、パレットにない薄いグレーにする。
export const NO_VALUE_COLOR = "#cbd5e1";
