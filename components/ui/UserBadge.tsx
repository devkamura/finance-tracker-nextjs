import { getUserBadgeClass } from "@/lib/user-colors";

type UserBadgeProps = {
  name: string;
  color?: string | null;
};

// 支払者・帰属先など、ユーザー名を表示する箇所で共通して使う。
// 管理画面で設定された色のバッジで表示し、未設定時はニュートラルな配色にする。
export function UserBadge({ name, color }: UserBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getUserBadgeClass(color)}`}
    >
      {name}
    </span>
  );
}
