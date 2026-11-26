// 分析・レシート一覧の「支払い先」の値（docs/全体仕様書/基本設計書.md 5.5節）。
// 支払い先は登録済みの支払い先（payee_id）で集計し、紐づいていないレシート（手入力）は「登録外」1つにまとめる。
// クライアントからも使うため server-only にはしない。

import { isPayeeHiddenForAll, type Payee } from "@/lib/receipts/payees";

// 登録済みの支払い先に紐づいていないレシート（手入力）の値
export const UNREGISTERED_PAYEE_KEY = "unregistered";
export const UNREGISTERED_PAYEE_LABEL = "登録外（手入力）";

export type AnalyticsPayee = {
  id: number;
  name: string;
};

// 支払い先の選択肢を名前順に並べる（見出しでは分けない。docs/全体仕様書/基本設計書.md 5.3節）。
// 表示対象（全体／ユーザー別）・ログインしているユーザーによらず同じ選択肢にする。
// メンバー全員が非表示にしている支払い先は、レシートで使われているとき（isUsed）だけ含める
// （過去分を分析で見られるように）。
export function buildAnalyticsPayees(
  payees: Payee[],
  members: { userId: string }[],
  isUsed: (payeeId: number) => boolean
): AnalyticsPayee[] {
  return payees
    .filter((payee) => !isPayeeHiddenForAll(payee, members) || isUsed(payee.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map((payee) => ({ id: payee.id, name: payee.name }));
}

// レシートの支払い先IDを、分析・一覧の支払い先の値にする
export function payeeKeyOf(payeeId: number | null): string {
  return payeeId === null ? UNREGISTERED_PAYEE_KEY : String(payeeId);
}
