// 分析・レシート一覧の「支払い先」の値（docs/分析拡充/要件定義書.md 4.7節・詳細設計書 F5）。
// 支払い先は登録済みの支払い先（payee_id）で集計し、紐づいていないレシート（手入力）は「登録外」1つにまとめる。
// クライアントからも使うため server-only にはしない。

import type { Payee } from "@/lib/receipts/payees";

// 登録済みの支払い先に紐づいていないレシート（手入力）の値
export const UNREGISTERED_PAYEE_KEY = "unregistered";
export const UNREGISTERED_PAYEE_LABEL = "登録外（手入力）";

// 選択肢の見出し。上から グループ全体 → 自分用（ログインしているユーザー） → 相方の自分用
export type AnalyticsPayeeSection = "shared" | "own" | "partner";

export type AnalyticsPayee = {
  id: number;
  name: string;
  section: AnalyticsPayeeSection;
  sectionLabel: string; // 「グループ全体」「自分用」「Bさんの自分用」
};

const SECTION_ORDER: AnalyticsPayeeSection[] = ["shared", "own", "partner"];

// 支払い先の選択肢を、見出しの順（グループ全体 → 自分用 → 相方の自分用）・名前順に並べる。
// 表示対象（全体／ユーザー別）によらず同じ選択肢にする。
// 非表示の支払い先は、レシートで使われているとき（isUsed）だけ含める（過去分を分析で見られるように）。
export function buildAnalyticsPayees(
  payees: Payee[],
  currentUserId: string,
  members: { userId: string; displayName: string }[],
  isUsed: (payeeId: number) => boolean
): AnalyticsPayee[] {
  const sectionOf = (payee: Payee): AnalyticsPayeeSection =>
    payee.ownerUserId === null ? "shared" : payee.ownerUserId === currentUserId ? "own" : "partner";
  const labelOf = (payee: Payee, section: AnalyticsPayeeSection): string => {
    if (section === "shared") return "グループ全体";
    if (section === "own") return "自分用";
    const owner = members.find((m) => m.userId === payee.ownerUserId);
    return `${owner?.displayName ?? "他のメンバー"}さんの自分用`;
  };

  return payees
    .filter((payee) => !payee.isHidden || isUsed(payee.id))
    .map((payee) => {
      const section = sectionOf(payee);
      return { payee, section, sectionLabel: labelOf(payee, section) };
    })
    .sort(
      (a, b) =>
        SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
        // 相方が複数いる場合に備え、相方の自分用は相方ごとにまとめる
        a.sectionLabel.localeCompare(b.sectionLabel, "ja") ||
        a.payee.name.localeCompare(b.payee.name, "ja")
    )
    .map(({ payee, section, sectionLabel }) => ({
      id: payee.id,
      name: payee.name,
      section,
      sectionLabel,
    }));
}

// レシートの支払い先IDを、分析・一覧の支払い先の値にする
export function payeeKeyOf(payeeId: number | null): string {
  return payeeId === null ? UNREGISTERED_PAYEE_KEY : String(payeeId);
}
