// 分析の「分ける」「絞り込み」の項目（docs/分析拡充/基本設計書.md 2.9節・3.7節、詳細設計書 F4 3章）。
// 分析画面（集計）とレシート一覧（絞り込み）の両方で、明細がどの値に当たるかを同じ関数で決め、
// グラフの値と一覧の合計が必ず一致するようにする。クライアントからも使うため server-only にはしない。

import {
  categoryColor,
  NO_VALUE_COLOR,
  paletteColor,
} from "@/lib/analytics/category-colors";
import {
  payeeKeyOf,
  UNREGISTERED_PAYEE_KEY,
  UNREGISTERED_PAYEE_LABEL,
  type AnalyticsPayee,
} from "@/lib/analytics/payees";
import type {
  AnalyticsBreakdown,
  AnalyticsCategory,
  AnalyticsCounterpart,
} from "@/lib/analytics/types";
import { COST_TYPE_LABELS, type CostType } from "@/lib/receipts/breakdowns";

export const DIMENSIONS = ["category", "breakdown", "costType", "payee", "counterpart"] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  category: "カテゴリ",
  breakdown: "内訳",
  costType: "費用区分",
  payee: "支払い先",
  counterpart: "相手",
};

// 内訳のない明細の値（内訳で分けるときは「内訳なし」としてまとめる。基本設計書 3.1節）
export const NO_BREAKDOWN_KEY = "none";

const COST_TYPES: CostType[] = ["fixed", "variable"];

export function isDimension(value: unknown): value is Dimension {
  return DIMENSIONS.includes(value as Dimension);
}

// 項目ごとの値の条件。値はすべて文字列で持つ（URLにそのまま載せるため）。
// カテゴリ・内訳・相手はID、費用区分は fixed／variable、
// 支払い先は登録済みの支払い先のID（紐づいていないレシートは UNREGISTERED_PAYEE_KEY）。
export type Conditions = Partial<Record<Dimension, string>>;

// 明細1件（分析の集約行・一覧の明細）の、項目の値
export type DimensionValues = {
  categoryId: number;
  breakdownId: number | null;
  counterpartId: number;
  payeeId: number | null; // null＝登録外（手入力）
};

// 名前・色を決めるためのマスタ
export type DimensionMaster = {
  categories: AnalyticsCategory[];
  breakdowns: AnalyticsBreakdown[];
  counterparts: AnalyticsCounterpart[];
  payees: AnalyticsPayee[]; // 見出しの順（グループ全体 → 自分用 → 相方の自分用）
};

export type CostTypeMap = Map<number, CostType>;

// カテゴリID → 費用区分。費用区分は明細ごとに保存せず、今のカテゴリの設定を使う（基本設計書 3.2節・Q6）。
export function costTypeMap(categories: { id: number; costType: CostType }[]): CostTypeMap {
  return new Map(categories.map((c) => [c.id, c.costType]));
}

// 明細が、その項目でどの値に当たるか
export function dimensionKey(
  values: DimensionValues,
  dimension: Dimension,
  costTypes: CostTypeMap
): string {
  switch (dimension) {
    case "category":
      return String(values.categoryId);
    case "breakdown":
      return values.breakdownId === null ? NO_BREAKDOWN_KEY : String(values.breakdownId);
    case "costType":
      // 設定の取得漏れなどで費用区分が分からないカテゴリは、カテゴリの初期値の多い変動費として扱う
      return costTypes.get(values.categoryId) ?? "variable";
    case "payee":
      return payeeKeyOf(values.payeeId);
    case "counterpart":
      return String(values.counterpartId);
  }
}

// 明細が、すべての条件に当てはまるか（条件がなければ当てはまる）
export function matchesConditions(
  values: DimensionValues,
  conditions: Conditions,
  costTypes: CostTypeMap
): boolean {
  return DIMENSIONS.every((dimension) => {
    const expected = conditions[dimension];
    return expected === undefined || dimensionKey(values, dimension, costTypes) === expected;
  });
}

function categoryName(categoryId: number, master: DimensionMaster): string {
  return master.categories.find((c) => c.id === categoryId)?.name ?? "不明";
}

// 支払い先の表示名。紐づいていないレシートは「登録外（手入力）」にまとめる。
function payeeLabel(key: string, master: DimensionMaster): string {
  if (key === UNREGISTERED_PAYEE_KEY) return UNREGISTERED_PAYEE_LABEL;
  return master.payees.find((p) => String(p.id) === key)?.name ?? "不明";
}

// 値の表示名。内訳は、カテゴリで絞り込んでいないとどのカテゴリの内訳か分からないため、
// 既定では「食費 ＞ 外食」とカテゴリを付ける（withCategory: false で「外食」だけにする）。
export function keyLabel(
  dimension: Dimension,
  key: string,
  master: DimensionMaster,
  options: { withCategory?: boolean } = {}
): string {
  switch (dimension) {
    case "category":
      return categoryName(Number(key), master);
    case "breakdown": {
      if (key === NO_BREAKDOWN_KEY) return "内訳なし";
      const breakdown = master.breakdowns.find((b) => String(b.id) === key);
      if (!breakdown) return "不明";
      return options.withCategory === false
        ? breakdown.name
        : `${categoryName(breakdown.categoryId, master)} ＞ ${breakdown.name}`;
    }
    case "costType":
      return COST_TYPE_LABELS[key as CostType] ?? "不明";
    case "payee":
      return payeeLabel(key, master);
    case "counterpart":
      return master.counterparts.find((c) => String(c.id) === key)?.name ?? "不明";
  }
}

// 値の色。カテゴリは既存のカテゴリの色（円グラフ・推移グラフで今までと同じ色）。
// それ以外は選択肢の並び順で決め、月や表示対象を切り替えても同じ値が同じ色になるようにする。
// 内訳は同じカテゴリの中での順番で決める（カテゴリで絞り込んだときに色が重ならないように）。
export function keyColor(
  dimension: Dimension,
  key: string,
  master: DimensionMaster
): string {
  switch (dimension) {
    case "category":
      return categoryColor(Number(key), master.categories);
    case "breakdown": {
      const breakdown = master.breakdowns.find((b) => String(b.id) === key);
      if (!breakdown) return NO_VALUE_COLOR;
      const siblings = master.breakdowns.filter((b) => b.categoryId === breakdown.categoryId);
      return paletteColor(siblings.indexOf(breakdown));
    }
    case "costType":
      return paletteColor(COST_TYPES.indexOf(key as CostType));
    case "payee":
      // 登録外は内訳なしと同じグレー。登録済みは選択肢の並び順で決める
      return key === UNREGISTERED_PAYEE_KEY
        ? NO_VALUE_COLOR
        : paletteColor(master.payees.findIndex((p) => String(p.id) === key));
    case "counterpart":
      return paletteColor(master.counterparts.findIndex((c) => String(c.id) === key));
  }
}

// group は選択肢の見出し（支払い先の「グループ全体」「自分用」など）。見出しのない選択肢は undefined。
export type DimensionOption = { key: string; label: string; group?: string };

// 絞り込みの値の選択肢。内訳はカテゴリの順（カテゴリID順 → 内訳の並び順）で、最後に「内訳なし」。
// 支払い先は、見出し（グループ全体 → 自分用 → 相方の自分用）ごとの登録済みの支払い先と、最後に「登録外（手入力）」。
export function dimensionOptions(
  dimension: Dimension,
  master: DimensionMaster
): DimensionOption[] {
  switch (dimension) {
    case "category":
      return master.categories.map((c) => ({ key: String(c.id), label: c.name }));
    case "breakdown":
      return [
        ...master.categories.flatMap((c) =>
          master.breakdowns
            .filter((b) => b.categoryId === c.id)
            .map((b) => ({ key: String(b.id), label: `${c.name} ＞ ${b.name}` }))
        ),
        { key: NO_BREAKDOWN_KEY, label: "内訳なし" },
      ];
    case "costType":
      return COST_TYPES.map((t) => ({ key: t, label: COST_TYPE_LABELS[t] }));
    case "payee":
      return [
        ...master.payees.map((p) => ({ key: String(p.id), label: p.name, group: p.sectionLabel })),
        { key: UNREGISTERED_PAYEE_KEY, label: UNREGISTERED_PAYEE_LABEL },
      ];
    case "counterpart":
      return master.counterparts.map((c) => ({ key: String(c.id), label: c.name }));
  }
}

// 条件の表示名（「食費の合計」「食費 ＞ 外食 ／ 全体で絞り込み中」などに使う）。条件がなければnull。
// 内訳を指定しているときは、内訳の名前にカテゴリが含まれるためカテゴリを重ねて出さない。
// 相手は名前だけだと表示対象（A／B）や支払い先と紛れるため「相手：」を付ける。
export function conditionsLabel(conditions: Conditions, master: DimensionMaster): string | null {
  const parts: string[] = [];
  if (conditions.costType !== undefined) {
    parts.push(keyLabel("costType", conditions.costType, master));
  }
  if (conditions.breakdown !== undefined) {
    if (conditions.breakdown === NO_BREAKDOWN_KEY && conditions.category !== undefined) {
      parts.push(`${keyLabel("category", conditions.category, master)} ＞ 内訳なし`);
    } else {
      parts.push(keyLabel("breakdown", conditions.breakdown, master));
    }
  } else if (conditions.category !== undefined) {
    parts.push(keyLabel("category", conditions.category, master));
  }
  if (conditions.payee !== undefined) {
    parts.push(keyLabel("payee", conditions.payee, master));
  }
  if (conditions.counterpart !== undefined) {
    parts.push(`相手：${keyLabel("counterpart", conditions.counterpart, master)}`);
  }
  return parts.length > 0 ? parts.join("・") : null;
}
