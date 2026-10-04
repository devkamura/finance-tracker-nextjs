// 管理画面でユーザーごとに設定できる色（ブルー／レッドの2色）。
// グラフのカテゴリの色（lib/analytics/category-colors.ts）と紛れないよう、
// メンバーの色は青系・赤系の2色に限定する（docs/支出分析機能/詳細設計書.md 6.5節）。
// Tailwindはクラス名を静的に解析するため、`bg-${color}-100`のような動的生成は
// 認識されない。そのため色ごとのクラス文字列をここに列挙する。

export const USER_COLORS = ["blue", "red"] as const;

export type UserColor = (typeof USER_COLORS)[number];

export const USER_COLOR_LABELS: Record<UserColor, string> = {
  blue: "ブルー",
  red: "レッド",
};

// バッジ（ユーザー名表示）用のクラス。
const BADGE_CLASSES: Record<UserColor, string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  red: "bg-red-100 text-red-700 border-red-200",
};

const DEFAULT_BADGE_CLASS = "bg-slate-100 text-slate-700 border-slate-200";

// 「共同」専用のバッジ配色。USER_COLORSとは絶対に被らない配色にすることで、
// 特定ユーザーの色と誤認されないようにしつつ、通常の未設定色（グレー1色）より
// コントラストを強めて視認性を確保する（濃いスレート＋太字）。
const JOINT_BADGE_CLASS =
  "bg-slate-700 text-white border-slate-700 font-semibold";

// 未設定または不正な値の場合はニュートラルな配色にフォールバックする。
export function getUserBadgeClass(color: string | null | undefined): string {
  if (color && (USER_COLORS as readonly string[]).includes(color)) {
    return BADGE_CLASSES[color as UserColor];
  }
  return DEFAULT_BADGE_CLASS;
}

// 帰属先バッジ用。ownerUserIdがnull（共同）の場合は専用配色を、
// 特定ユーザーの場合はそのユーザーの色（未設定ならデフォルト）を返す。
export function getOwnerBadgeClass(
  ownerUserId: string | null,
  ownerColor: string | null | undefined
): string {
  if (ownerUserId === null) {
    return JOINT_BADGE_CLASS;
  }
  return getUserBadgeClass(ownerColor);
}

// カラーピッカーのスウォッチ（単色の丸）用クラス。
const SWATCH_CLASSES: Record<UserColor, string> = {
  blue: "bg-blue-500",
  red: "bg-red-500",
};

export function getUserSwatchClass(color: UserColor): string {
  return SWATCH_CLASSES[color];
}
