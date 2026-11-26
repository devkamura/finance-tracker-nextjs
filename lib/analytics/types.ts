// 支出分析画面にサーバーから一括で渡すデータの型（docs/全体仕様書/基本設計書.md 5.5節）。
// 明細1件ずつではなく「月×カテゴリ×内訳×相手×支払い先×帰属先×特別費」で合計した行を渡す
// （集計結果は同じで、データ量を抑えるため。docs/全体仕様書/基本設計書.md 5.5節）。
// 費用区分はカテゴリから求めるため行には持たない（基本設計書 3.2節）。

import type { AnalyticsPayee } from "@/lib/analytics/payees";
import type { CostType } from "@/lib/receipts/breakdowns";

export type AnalyticsRow = {
  month: string; // "2026-09"
  categoryId: number;
  breakdownId: number | null; // null＝内訳なし
  counterpartId: number;
  payeeId: number | null; // 登録済みの支払い先のID。null＝登録外（手入力。要件定義書 4.7節）
  ownerUserId: string | null; // null＝共同
  isSpecialExpense: boolean; // 特別費か（Issue #41。「特別費を含める」が OFF のときは集計から除く）
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
  costType?: CostType | null; // 内訳の費用区分（Issue #49）。省略時はカテゴリの費用区分として扱う
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
  payees: AnalyticsPayee[]; // 支払い先の選択肢（名前順。lib/analytics/payees.ts）
  members: AnalyticsMember[];
  rows: AnalyticsRow[];
};

// 表示対象（docs/全体仕様書/用語と算出方法.md 3.2節）
export type Scope =
  | { kind: "all" }
  | { kind: "user"; userId: string; includeJoint: boolean };
