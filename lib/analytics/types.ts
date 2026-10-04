// 支出分析画面にサーバーから一括で渡すデータの型（docs/支出分析機能/詳細設計書.md 4.2節）。
// 明細1件ずつではなく「月×カテゴリ×内訳×相手×支払い先×帰属先」で合計した行を渡す
// （集計結果は同じで、データ量を抑えるため。docs/分析拡充/詳細設計書.md F4 2章）。
// 費用区分はカテゴリから求めるため行には持たない（基本設計書 3.2節）。

import type { CostType } from "@/lib/receipts/breakdowns";

export type AnalyticsRow = {
  month: string; // "2026-09"
  categoryId: number;
  breakdownId: number | null; // null＝内訳なし
  counterpartId: number;
  payeeName: string; // レシートに保存された支払い先名（相方用・手入力も名前で集計する）
  ownerUserId: string | null; // null＝共同
  amount: number; // 按分・返金の符号反転済みの合計（円、整数）
};

export type AnalyticsCategory = {
  id: number;
  name: string;
  costType: CostType; // グループの費用区分（設定がなければカテゴリの初期値）
  // 将来カテゴリをグループごとに設定できるようにする際の色。現状は常にnull。
  color?: string | null;
};

// 内訳（非表示のものも含む。分析では非表示でもそのまま表示する）
export type AnalyticsBreakdown = {
  id: number;
  categoryId: number;
  name: string;
};

// 相手（非表示・グループから外れたメンバーの相手も含む）
export type AnalyticsCounterpart = {
  id: number;
  name: string;
};

export type AnalyticsMember = {
  userId: string;
  displayName: string;
  color: string | null;
};

export type AnalyticsData = {
  today: string; // "2026-10-03"
  months: string[]; // 当月を含む12ヶ月（古い順）
  categories: AnalyticsCategory[];
  breakdowns: AnalyticsBreakdown[];
  counterparts: AnalyticsCounterpart[];
  payeeNames: string[]; // 12ヶ月の行に出てくる支払い先名（名前順）
  members: AnalyticsMember[];
  rows: AnalyticsRow[];
};

// 表示対象（docs/支出分析機能/基本設計書.md 3.2節）
export type Scope =
  | { kind: "all" }
  | { kind: "user"; userId: string; includeJoint: boolean };
