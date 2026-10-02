// 支出分析画面にサーバーから一括で渡すデータの型（docs/支出分析機能/詳細設計書.md 4.2節）。
// 明細1件ずつではなく「月×カテゴリ×帰属先」で合計した行を渡す（集計結果は同じで、
// データ量を最大 12ヶ月×カテゴリ数×3 行に抑えるため）。

export type AnalyticsRow = {
  month: string; // "2026-09"
  categoryId: number;
  ownerUserId: string | null; // null＝共同
  amount: number; // 按分・返金の符号反転済みの合計（円、整数）
};

export type AnalyticsCategory = {
  id: number;
  name: string;
  // 将来カテゴリをグループごとに設定できるようにする際の色。現状は常にnull。
  color?: string | null;
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
  members: AnalyticsMember[];
  rows: AnalyticsRow[];
};

// 表示対象（docs/支出分析機能/基本設計書.md 3.2節）
export type Scope =
  | { kind: "all" }
  | { kind: "user"; userId: string; includeJoint: boolean };
