// 管理画面でユーザーごとに設定できる12色のパレット。
// Tailwindはクラス名を静的に解析するため、`bg-${color}-100`のような動的生成は
// 認識されない。そのため色ごとのクラス文字列をここに列挙する。

export const USER_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
] as const;

export type UserColor = (typeof USER_COLORS)[number];

export const USER_COLOR_LABELS: Record<UserColor, string> = {
  red: "レッド",
  orange: "オレンジ",
  amber: "アンバー",
  yellow: "イエロー",
  lime: "ライム",
  green: "グリーン",
  teal: "ティール",
  cyan: "シアン",
  blue: "ブルー",
  indigo: "インディゴ",
  purple: "パープル",
  pink: "ピンク",
};

// バッジ（ユーザー名表示）用のクラス。
const BADGE_CLASSES: Record<UserColor, string> = {
  red: "bg-red-100 text-red-700 border-red-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  lime: "bg-lime-100 text-lime-800 border-lime-200",
  green: "bg-green-100 text-green-700 border-green-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
  cyan: "bg-cyan-100 text-cyan-700 border-cyan-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  pink: "bg-pink-100 text-pink-700 border-pink-200",
};

const DEFAULT_BADGE_CLASS = "bg-slate-100 text-slate-700 border-slate-200";

// 「共同」専用のバッジ配色。USER_COLORS(12色)とは絶対に被らない配色にすることで、
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
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-400",
  lime: "bg-lime-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

export function getUserSwatchClass(color: UserColor): string {
  return SWATCH_CLASSES[color];
}
