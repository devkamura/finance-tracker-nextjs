// 結合テスト：レシート一覧のフィルタの計算の検証（Issue #39）。
// 1枚のレシートに A・B・共同の明細が混ざる場合を中心に、
//   - 負担者ごとの「うち」の金額が、精算と同じ按分（allocateReceiptAmount）どおりか
//   - 分析画面の集計（buildAnalyticsRows＋sumByDimension）と一致するか
//   - 支払者・負担者・期間で分けた合計が、全体の合計と過不足なく一致するか
// を、手で作ったレシートと、乱数で作った多数のレシート（税別・支払額のずれ・返金を含む）で確かめる。

import { describe, expect, it } from "vitest";

import { sumByDimension } from "@/lib/analytics/aggregate";
import { costTypeMap } from "@/lib/analytics/dimensions";
import type { Scope } from "@/lib/analytics/types";
import { buildAnalyticsRows } from "@/lib/analytics/queries";
import { parseListFilter } from "@/lib/receipts/list-params";
import { parseListSearch, withUserSelection, type ListConditionParams } from "@/lib/receipts/list-search";
import { buildReceiptListView } from "@/lib/receipts/list-view";
import { allocateReceiptAmount } from "@/lib/settlement/calculate";
import type { ReceiptDetailItemView, ReceiptListItem } from "@/types/receipt";

const A = "user-a";
const B = "user-b";
const FOOD = 1;
const DAILY = 2;
const MONTH = "2026-07";
const master = {
  categories: [
    { id: FOOD, name: "食費", costType: "variable" as const },
    { id: DAILY, name: "日用品", costType: "fixed" as const },
  ],
  breakdowns: [],
  counterparts: [],
  payees: [],
};
const costTypes = costTypeMap(master.categories);
const members = [
  { userId: A, displayName: "A" },
  { userId: B, displayName: "B" },
];

type ItemInput = {
  owner: string | null; // null＝共同
  price: number;
  categoryId?: number;
  exclusive?: number; // 税別の税率の倍率（1.08 など）。省略時は税込
  name?: string;
};

let itemSeq = 0;
function makeReceipt(input: {
  id: string;
  day: number;
  payer: string;
  amount: number;
  items: ItemInput[];
  refund?: boolean;
  payeeName?: string;
}): ReceiptListItem {
  const items: ReceiptDetailItemView[] = input.items.map((i) => ({
    id: `${input.id}-${++itemSeq}`,
    itemName: i.name ?? "商品",
    price: i.price,
    taxType: i.exclusive ? "exclusive" : "inclusive",
    taxRateName: null,
    taxRateMultiplier: i.exclusive ?? null,
    categoryId: i.categoryId ?? FOOD,
    categoryName: "",
    breakdownId: null,
    breakdownName: null,
    counterpartId: 21,
    counterpartName: "ふたり",
    ownerUserId: i.owner,
    ownerDisplayName: i.owner ?? "共同",
    ownerColor: null,
    tagNames: [],
  }));
  return {
    id: input.id,
    // 日本時間の21時（どのタイムゾーンで実行しても同じ月・日になる時刻）
    occurredAt: `${MONTH}-${String(input.day).padStart(2, "0")}T12:00:00.000Z`,
    payeeId: null,
    payeeName: input.payeeName ?? "お店",
    amount: input.amount,
    transactionTypeName: input.refund ? "返金" : "支出",
    payerUserId: input.payer,
    payerDisplayName: input.payer,
    payerColor: null,
    receiptImageUrl: null,
    isDuplicated: false,
    createdByDisplayName: input.payer,
    items,
  };
}

// 画面（ReceiptListView）と同じ順番で、URLの条件から一覧の表示内容を作る
function viewFor(receipts: ReceiptListItem[], params: ListConditionParams) {
  const filter = parseListFilter(params, master, members);
  const search = parseListSearch(params, MONTH, members);
  return buildReceiptListView(receipts, filter, "asc", costTypes, search);
}

const burden = (userId: string, includeJoint: boolean) =>
  withUserSelection({}, { userId, basis: "burden", includeJoint });
const payer = (userId: string) =>
  withUserSelection({}, { userId, basis: "payer", includeJoint: false });

// 分析画面と同じ集計で、表示対象（scope）の総支出を求める
function analyticsTotal(receipts: ReceiptListItem[], scope: Scope): number {
  const rows = buildAnalyticsRows(
    receipts.map((r) => ({
      id: r.id,
      occurred_at: r.occurredAt,
      amount: r.amount,
      payee_id: r.payeeId,
      payer_user_id: r.payerUserId,
      transaction_types: { name: r.transactionTypeName },
      receipt_details: r.items.map((i) => ({
        price: i.price,
        tax_type: i.taxType,
        category_id: i.categoryId,
        breakdown_id: i.breakdownId,
        counterpart_id: i.counterpartId,
        owner_user_id: i.ownerUserId,
        consumption_taxes: i.taxRateMultiplier ? { multiplier: i.taxRateMultiplier } : null,
      })),
    }))
  );
  if (rows.length === 0) return 0;
  return sumByDimension(rows, scope, rows[0].month, "category", {}, costTypes).reduce(
    (sum, s) => sum + s.amount,
    0
  );
}

const signed = (r: ReceiptListItem) => (r.transactionTypeName === "返金" ? -r.amount : r.amount);

describe("1枚のレシートに A・B・共同の明細が混ざる場合", () => {
  // B が支払った 3,000円のレシート。A の食費 1,000（税込）・B の日用品 800（税込）・
  // 共同の食費 1,000（税別10%＝1,100）。明細の税込合計 2,900 と支払額 3,000 がずれている
  const mixed = makeReceipt({
    id: "mixed",
    day: 10,
    payer: B,
    amount: 3000,
    items: [
      { owner: A, price: 1000 },
      { owner: B, price: 800, categoryId: DAILY },
      { owner: null, price: 1000, exclusive: 1.1 },
    ],
  });
  // 精算と同じ按分（明細ごとの負担額）
  const [allocA, allocB, allocJoint] = allocateReceiptAmount({
    payerUserId: B,
    amount: 3000,
    isRefund: false,
    details: mixed.items.map((i) => ({
      price: i.price,
      taxType: i.taxType,
      taxRateMultiplier: i.taxRateMultiplier,
      ownerUserId: i.ownerUserId,
    })),
  });

  it("I-58: 按分の前提（支払額のずれを比率で配り、合計が支払額と一致する）", () => {
    // 1,000：800：1,100 の比率で 3,000 を配る：1,034.48・827.59・1,137.93。
    // 切り捨てた合計 2,998 との差の 2円は、精算と同じ規則（U-122）で金額の大きい明細（共同・A）に1円ずつ足す
    expect([allocA, allocB, allocJoint]).toEqual([1035, 827, 1138]);
    expect(allocA + allocB + allocJoint).toBe(3000);
  });

  it("I-58: 負担者ごとに、その人の明細だけが選ばれ「うち」の金額が按分どおりになる", () => {
    const cases: [ListConditionParams, string[], number][] = [
      [burden(A, false), [mixed.items[0].id], allocA],
      [burden(A, true), [mixed.items[0].id, mixed.items[2].id], allocA + allocJoint / 2],
      [burden(B, false), [mixed.items[1].id], allocB],
      [burden(B, true), [mixed.items[1].id, mixed.items[2].id], allocB + allocJoint / 2],
    ];
    for (const [params, itemIds, amount] of cases) {
      const view = viewFor([mixed], params);
      expect(view.items).toHaveLength(1);
      expect(view.items[0].match?.matchedItemIds).toEqual(itemIds);
      expect(view.items[0].match?.matchedAmount).toBe(amount);
      expect(view.matchedTotal).toBe(amount);
    }
    // A＋共同1/2 と B＋共同1/2 を足すと、レシートの支払額にちょうどなる（共同は半分ずつ）
    expect(allocA + allocJoint / 2 + (allocB + allocJoint / 2)).toBe(3000);
  });

  it("I-58: 支払者で絞るときは、負担者に関係なくレシート全体（支払額）が入る", () => {
    expect(viewFor([mixed], payer(B)).matchedTotal).toBe(3000);
    expect(viewFor([mixed], payer(A)).items).toEqual([]);
  });

  it("I-58: 負担者とカテゴリを組み合わせると、両方に当てはまる明細だけが入る", () => {
    // A＋共同1/2・食費 → A の食費と共同の食費の半分。B の日用品は入らない
    const view = viewFor([mixed], { ...burden(A, true), category: String(FOOD) });
    expect(view.matchedTotal).toBe(allocA + allocJoint / 2);
    // B（共同なし）・食費 → B の食費の明細はないので、このレシートは出ない
    expect(viewFor([mixed], { ...burden(B, false), category: String(FOOD) }).items).toEqual([]);
  });

  it("I-58: 返金のレシートでは、負担者ごとの「うち」の金額がマイナスになる", () => {
    const refund = { ...mixed, id: "refund", transactionTypeName: "返金" };
    expect(viewFor([refund], burden(A, true)).matchedTotal).toBe(-(allocA + allocJoint / 2));
    expect(viewFor([refund], payer(B)).matchedTotal).toBe(-3000);
  });

  it("I-58: 負担者での合計は、分析画面の同じ表示対象の総支出と一致する", () => {
    for (const [params, scope] of [
      [burden(A, false), { kind: "user", userId: A, includeJoint: false }],
      [burden(A, true), { kind: "user", userId: A, includeJoint: true }],
      [burden(B, false), { kind: "user", userId: B, includeJoint: false }],
      [burden(B, true), { kind: "user", userId: B, includeJoint: true }],
    ] as [ListConditionParams, Scope][]) {
      expect(viewFor([mixed], params).matchedTotal).toBe(analyticsTotal([mixed], scope));
    }
  });
});

// ---- 乱数で作った多数のレシートでの検証 ----

// 毎回同じ結果になる乱数（失敗したときに再現できるよう、種を固定する）
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function randomReceipts(seed: number, count: number): ReceiptListItem[] {
  const random = seededRandom(seed);
  const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)];
  const names = ["牛乳", "パン", "Coffee", "ｺｰﾋｰ豆", "洗剤", "トイレットペーパー"];
  return Array.from({ length: count }, (_, n) => {
    const items: ItemInput[] = Array.from({ length: 1 + Math.floor(random() * 4) }, () => ({
      owner: pick([A, B, null]),
      price: 1 + Math.floor(random() * 3000),
      categoryId: pick([FOOD, DAILY]),
      exclusive: pick([undefined, undefined, 1.08, 1.1]),
      name: pick(names),
    }));
    const taxed = items.reduce(
      (sum, i) => sum + Math.floor(i.price * (i.exclusive ?? 1)),
      0
    );
    return makeReceipt({
      id: `r${n}`,
      day: 1 + Math.floor(random() * 31),
      payer: pick([A, B]),
      // 支払額は明細の合計から −10%〜＋10% ずらす（クーポン・端数のずれ）
      amount: Math.max(1, Math.round(taxed * (0.9 + random() * 0.2))),
      items,
      refund: random() < 0.1,
      payeeName: pick(["スーパー", "STARBUCKS", "ドラッグストア"]),
    });
  });
}

describe("乱数で作ったレシートでの検証（A・B・共同の明細が混ざる・税別・支払額のずれ・返金）", () => {
  const seeds = [1, 2, 3, 42, 2026];
  const EPS = 6; // 小数点以下の桁（共同1/2で .5 が出るため、浮動小数点の誤差を許す）

  for (const seed of seeds) {
    const receipts = randomReceipts(seed, 120);
    const allTotal = receipts.reduce((sum, r) => sum + signed(r), 0);

    it(`I-59（seed=${seed}）: 負担者の合計は分析画面の総支出と一致し、A＋共同1/2 と B＋共同1/2 の和は全体の合計になる`, () => {
      const totals = new Map<string, number>();
      for (const userId of [A, B]) {
        for (const includeJoint of [false, true]) {
          const total = viewFor(receipts, burden(userId, includeJoint)).matchedTotal;
          expect(total).toBeCloseTo(
            analyticsTotal(receipts, { kind: "user", userId, includeJoint }),
            EPS
          );
          totals.set(`${userId}:${includeJoint}`, total);
        }
      }
      // 全体（分析画面から来た総支出・全体）
      expect(viewFor(receipts, { scope: "all" }).matchedTotal).toBeCloseTo(allTotal, EPS);
      expect(totals.get(`${A}:true`)! + totals.get(`${B}:true`)!).toBeCloseTo(allTotal, EPS);
      // 共同の分＝全体 − A だけ − B だけ。A＋共同1/2 は A だけ＋共同の半分
      const joint = allTotal - totals.get(`${A}:false`)! - totals.get(`${B}:false`)!;
      expect(totals.get(`${A}:true`)!).toBeCloseTo(totals.get(`${A}:false`)! + joint / 2, EPS);
    });

    it(`I-59（seed=${seed}）: 1枚ごとの「うち」の金額が、按分の関数を使わずに求めた比率の金額と合う`, () => {
      for (const r of receipts) {
        const sign = r.transactionTypeName === "返金" ? -1 : 1;
        // 税込に直した明細の金額（税別は切り捨て。精算と同じ）と、支払額を比率で配った理想の金額
        const taxed = r.items.map((i) => Math.floor(i.price * (i.taxRateMultiplier ?? 1)));
        const taxedSum = taxed.reduce((sum, t) => sum + t, 0);
        const ideal = (owner: string | null) =>
          r.items.reduce(
            (sum, i, index) =>
              i.ownerUserId === owner ? sum + (taxed[index] * r.amount) / taxedSum : sum,
            0
          );
        const countOf = (owner: string | null) =>
          r.items.filter((i) => i.ownerUserId === owner).length;
        const amountOf = (params: ListConditionParams) =>
          viewFor([r], params).matchedTotal * sign;

        const onlyA = amountOf(burden(A, false));
        const onlyB = amountOf(burden(B, false));
        const all = amountOf({ scope: "all" });
        const joint = all - onlyA - onlyB;

        // 全体はレシートの支払額にちょうどなる（1円も増減しない）
        expect(all).toBe(r.amount);
        // A・B・共同のそれぞれは、理想の金額との差が明細の数（端数の1円×明細数）未満
        expect(Math.abs(onlyA - ideal(A))).toBeLessThan(countOf(A) + 1e-9 || 1e-9);
        expect(Math.abs(onlyB - ideal(B))).toBeLessThan(countOf(B) + 1e-9 || 1e-9);
        expect(Math.abs(joint - ideal(null))).toBeLessThan(countOf(null) + 1e-9 || 1e-9);
        // 共同1/2 を含めると、共同の分のちょうど半分が足される
        expect(amountOf(burden(A, true))).toBeCloseTo(onlyA + joint / 2, EPS);
        expect(amountOf(burden(B, true))).toBeCloseTo(onlyB + joint / 2, EPS);
      }
    });

    it(`I-59（seed=${seed}）: 支払者で分けると、件数も合計も全体と過不足なく一致する`, () => {
      const viewA = viewFor(receipts, payer(A));
      const viewB = viewFor(receipts, payer(B));
      expect(viewA.items.length + viewB.items.length).toBe(receipts.length);
      expect(viewA.matchedTotal + viewB.matchedTotal).toBe(allTotal);
      expect(viewA.items.every((i) => i.receipt.payerUserId === A)).toBe(true);
    });

    it(`I-59（seed=${seed}）: 期間を2つに分けると全件に一致し、期間の判定は日本時間の日付と一致する`, () => {
      const first = viewFor(receipts, { end: `${MONTH}-15` });
      const second = viewFor(receipts, { start: `${MONTH}-16` });
      expect(first.items.length + second.items.length).toBe(receipts.length);
      expect(first.matchedTotal + second.matchedTotal).toBe(allTotal);
      // 別の方法（Intl の日本時間）で求めた日付と比べる
      const jstDay = (iso: string) =>
        Number(
          new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", day: "numeric" }).format(
            new Date(iso)
          )
        );
      expect(first.items.every((i) => jstDay(i.receipt.occurredAt) <= 15)).toBe(true);
      expect(second.items.every((i) => jstDay(i.receipt.occurredAt) >= 16)).toBe(true);
    });

    it(`I-59（seed=${seed}）: 条件を組み合わせた結果は、それぞれの条件の結果の共通部分になる（AND）`, () => {
      const ids = (params: ListConditionParams) =>
        new Set(viewFor(receipts, params).items.map((i) => i.receipt.id));
      // 負担者とカテゴリは明細単位の条件のため、同じ明細で両方を満たす必要がある（分析画面の集計と同じ）。
      // そのため1つの条件として扱い、レシート単位の条件（期間・キーワード）との AND を確かめる
      const conditions: ListConditionParams[] = [
        { ...burden(A, true), category: String(DAILY) },
        { start: `${MONTH}-05`, end: `${MONTH}-25` },
        { q: "coffee" },
      ];
      const combined = ids(Object.assign({}, ...conditions));
      const intersection = conditions
        .map(ids)
        .reduce((acc, set) => new Set([...acc].filter((id) => set.has(id))));
      expect(combined).toEqual(intersection);
      // キーワード「coffee」は英字の「Coffee」に当てはまる（カナの「ｺｰﾋｰ豆」には当てはまらない）
      for (const id of ids({ q: "coffee" })) {
        const r = receipts.find((x) => x.id === id)!;
        expect(r.items.some((i) => i.itemName === "Coffee")).toBe(true);
      }
    });

    it(`I-59（seed=${seed}）: 負担者×カテゴリは、同じ明細で両方を満たすレシートだけが出る`, () => {
      const combined = viewFor(receipts, { ...burden(A, false), category: String(DAILY) });
      for (const { receipt, match } of combined.items) {
        const matched = receipt.items.filter((i) => match!.matchedItemIds.includes(i.id));
        expect(matched.length).toBeGreaterThan(0);
        expect(matched.every((i) => i.ownerUserId === A && i.categoryId === DAILY)).toBe(true);
      }
      // 当てはまらなかったレシートには、A の日用品の明細がない
      const shown = new Set(combined.items.map((i) => i.receipt.id));
      for (const r of receipts.filter((x) => !shown.has(x.id))) {
        expect(r.items.some((i) => i.ownerUserId === A && i.categoryId === DAILY)).toBe(false);
      }
    });
  }
});
