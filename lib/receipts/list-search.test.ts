import { describe, expect, it } from "vitest";

import {
  countPanelConditions,
  matchesSearch,
  monthDateRange,
  normalizeKeyword,
  parseListSearch,
  readUserSelection,
  searchLabels,
  toJstDateString,
  withUserSelection,
  type ReceiptListSearch,
} from "@/lib/receipts/list-search";

const members = [
  { userId: "user-a", displayName: "A" },
  { userId: "user-b", displayName: "B" },
];

const NO_SEARCH: ReceiptListSearch = {
  payerUserId: null,
  startDate: null,
  endDate: null,
  keyword: null,
};

// 判定に使う項目だけのレシート
function receipt(input: {
  occurredAt?: string;
  payerUserId?: string;
  payeeName?: string;
  itemNames?: string[];
}) {
  return {
    occurredAt: input.occurredAt ?? "2026-07-15T03:00:00.000Z",
    payerUserId: input.payerUserId ?? "user-a",
    payeeName: input.payeeName ?? "スーパー",
    items: (input.itemNames ?? ["牛乳"]).map((itemName) => ({ itemName })),
  };
}

describe("parseListSearch", () => {
  it("U-144: 支払者・期間・キーワードを読み取る", () => {
    expect(
      parseListSearch(
        { payer: "user-b", start: "2026-07-01", end: "2026-07-07", q: "  コーヒー " },
        "2026-07",
        members
      )
    ).toEqual({
      payerUserId: "user-b",
      startDate: "2026-07-01",
      endDate: "2026-07-07",
      keyword: "コーヒー",
    });
  });

  it("U-144: 片方だけの期間も読み取る", () => {
    expect(parseListSearch({ start: "2026-07-10" }, "2026-07", members)).toEqual({
      ...NO_SEARCH,
      startDate: "2026-07-10",
    });
    expect(parseListSearch({ end: "2026-07-10" }, "2026-07", members)).toEqual({
      ...NO_SEARCH,
      endDate: "2026-07-10",
    });
  });

  it("U-144: 開始日が終了日より後なら入れ替える", () => {
    expect(
      parseListSearch({ start: "2026-07-20", end: "2026-07-05" }, "2026-07", members)
    ).toMatchObject({ startDate: "2026-07-05", endDate: "2026-07-20" });
  });

  it("U-144: 条件がなければ null", () => {
    expect(parseListSearch({}, "2026-07", members)).toBeNull();
    expect(parseListSearch({ q: "   " }, "2026-07", members)).toBeNull();
  });

  it("U-144: グループ外のユーザー・月の外・存在しない・形式違いの日付は無視する", () => {
    expect(parseListSearch({ payer: "user-x" }, "2026-07", members)).toBeNull();
    expect(parseListSearch({ start: "2026-08-01" }, "2026-07", members)).toBeNull();
    expect(parseListSearch({ end: "2026-06-30" }, "2026-07", members)).toBeNull();
    expect(parseListSearch({ start: "2026-02-31" }, "2026-02", members)).toBeNull();
    expect(parseListSearch({ start: "2026/07/01" }, "2026-07", members)).toBeNull();
    // 正しい条件だけが残る
    expect(
      parseListSearch({ payer: "user-x", start: "2026-08-01", q: "牛乳" }, "2026-07", members)
    ).toEqual({ ...NO_SEARCH, keyword: "牛乳" });
  });

  it("U-144: 配列で渡されたら先頭の値を使う", () => {
    expect(parseListSearch({ payer: ["user-a", "user-b"] }, "2026-07", members)).toEqual({
      ...NO_SEARCH,
      payerUserId: "user-a",
    });
  });
});

describe("matchesSearch", () => {
  it("U-145: 支払者で絞る", () => {
    const search = { ...NO_SEARCH, payerUserId: "user-b" };
    expect(matchesSearch(receipt({ payerUserId: "user-b" }), search)).toBe(true);
    expect(matchesSearch(receipt({ payerUserId: "user-a" }), search)).toBe(false);
  });

  it("U-145: 期間は開始日・終了日を含み、日本時間の日付で判定する", () => {
    const search = { ...NO_SEARCH, startDate: "2026-07-10", endDate: "2026-07-20" };
    // 7/10 0:00（日本時間）= 7/9 15:00（UTC）
    expect(matchesSearch(receipt({ occurredAt: "2026-07-09T15:00:00.000Z" }), search)).toBe(true);
    // 7/9 23:59（日本時間）
    expect(matchesSearch(receipt({ occurredAt: "2026-07-09T14:59:00.000Z" }), search)).toBe(false);
    // 7/20 23:59（日本時間）
    expect(matchesSearch(receipt({ occurredAt: "2026-07-20T14:59:00.000Z" }), search)).toBe(true);
    // 7/21 0:00（日本時間）
    expect(matchesSearch(receipt({ occurredAt: "2026-07-20T15:00:00.000Z" }), search)).toBe(false);
  });

  it("U-145: 期間の片方だけの指定", () => {
    const from = { ...NO_SEARCH, startDate: "2026-07-10" };
    const to = { ...NO_SEARCH, endDate: "2026-07-10" };
    const early = receipt({ occurredAt: "2026-07-05T03:00:00.000Z" });
    const late = receipt({ occurredAt: "2026-07-25T03:00:00.000Z" });
    expect([matchesSearch(early, from), matchesSearch(late, from)]).toEqual([false, true]);
    expect([matchesSearch(early, to), matchesSearch(late, to)]).toEqual([true, false]);
  });

  it("U-145: キーワードは支払い先名・商品名の部分一致（大文字小文字・全角半角を区別しない）", () => {
    const target = receipt({ payeeName: "STARBUCKS 渋谷店", itemNames: ["ｶﾌｪﾗﾃ", "スコーン"] });
    expect(matchesSearch(target, { ...NO_SEARCH, keyword: "starbucks" })).toBe(true);
    expect(matchesSearch(target, { ...NO_SEARCH, keyword: "ＳＴＡＲ" })).toBe(true);
    expect(matchesSearch(target, { ...NO_SEARCH, keyword: "渋谷" })).toBe(true);
    expect(matchesSearch(target, { ...NO_SEARCH, keyword: "カフェ" })).toBe(true);
    expect(matchesSearch(target, { ...NO_SEARCH, keyword: "コーン" })).toBe(true);
    expect(matchesSearch(target, { ...NO_SEARCH, keyword: "ドーナツ" })).toBe(false);
  });

  it("U-145: 条件はすべて満たすときだけ当てはまる（AND）", () => {
    const search: ReceiptListSearch = {
      payerUserId: "user-a",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      keyword: "牛乳",
    };
    expect(matchesSearch(receipt({}), search)).toBe(true);
    expect(matchesSearch(receipt({ payerUserId: "user-b" }), search)).toBe(false);
    expect(matchesSearch(receipt({ itemNames: ["パン"] }), search)).toBe(false);
  });
});

describe("日付・キーワードの補助関数", () => {
  it("U-145: 月の初日・末日（うるう年を含む）と日本時間の日付", () => {
    expect(monthDateRange("2026-07")).toEqual({ min: "2026-07-01", max: "2026-07-31" });
    expect(monthDateRange("2028-02")).toEqual({ min: "2028-02-01", max: "2028-02-29" });
    expect(toJstDateString("2026-07-31T15:30:00.000Z")).toBe("2026-08-01");
    expect(normalizeKeyword("ＡｂＣ ｶﾞ")).toBe("abc ガ");
  });
});

describe("readUserSelection・withUserSelection", () => {
  it("U-146: URLからユーザーの選択を読む（支払者／負担者＋共同／全員）", () => {
    expect(readUserSelection({ payer: "user-a" }, members, "burden")).toEqual({
      userId: "user-a",
      basis: "payer",
      includeJoint: false,
    });
    expect(readUserSelection({ scope: "user-b", joint: "1" }, members, "payer")).toEqual({
      userId: "user-b",
      basis: "burden",
      includeJoint: true,
    });
    // 全体（分析画面から）・グループ外・指定なしは全員。基準は最後に選んでいたもの
    expect(readUserSelection({ scope: "all" }, members, "burden")).toEqual({
      userId: null,
      basis: "burden",
      includeJoint: false,
    });
    expect(readUserSelection({ payer: "user-x" }, members, "payer").userId).toBeNull();
  });

  it("U-146: 選択をURLに反映する。支払者と負担者は同時に指定しない", () => {
    const base = { category: "1", scope: "user-a", joint: "1", q: "牛乳" };
    expect(
      withUserSelection(base, { userId: "user-b", basis: "payer", includeJoint: true })
    ).toEqual({ category: "1", payer: "user-b", q: "牛乳" });
    expect(
      withUserSelection({ payer: "user-a" }, { userId: "user-b", basis: "burden", includeJoint: false })
    ).toEqual({ scope: "user-b" });
    expect(
      withUserSelection({}, { userId: "user-a", basis: "burden", includeJoint: true })
    ).toEqual({ scope: "user-a", joint: "1" });
  });

  it("U-146: 全員を選ぶと、支払者・負担者・分析画面からの全体をすべて外す", () => {
    expect(
      withUserSelection(
        { category: "1", scope: "all", payer: "user-a" },
        { userId: null, basis: "burden", includeJoint: true }
      )
    ).toEqual({ category: "1" });
  });

  it("U-146: 元のパラメータは書き換えない", () => {
    const base = { scope: "user-a" };
    withUserSelection(base, { userId: "user-b", basis: "payer", includeJoint: false });
    expect(base).toEqual({ scope: "user-a" });
  });
});

describe("countPanelConditions", () => {
  it("U-147: ユーザー・期間・キーワードをそれぞれ1つと数える", () => {
    expect(countPanelConditions({}, members)).toBe(0);
    expect(countPanelConditions({ payer: "user-a" }, members)).toBe(1);
    expect(countPanelConditions({ scope: "user-a", joint: "1" }, members)).toBe(1);
    expect(countPanelConditions({ start: "2026-07-01", end: "2026-07-07" }, members)).toBe(1);
    expect(
      countPanelConditions({ payer: "user-a", end: "2026-07-07", q: "牛乳" }, members)
    ).toBe(3);
  });

  it("U-147: 分析画面からの条件・全体・空白だけのキーワードは数えない", () => {
    expect(countPanelConditions({ category: "1", scope: "all", q: "  " }, members)).toBe(0);
  });
});

describe("searchLabels", () => {
  it("U-149: 条件ごとの表示名", () => {
    expect(
      searchLabels(
        { payerUserId: "user-b", startDate: "2026-07-01", endDate: "2026-07-07", keyword: "コーヒー" },
        members
      )
    ).toEqual(["支払者：B", "7/1〜7/7", "「コーヒー」を含む"]);
    expect(searchLabels({ ...NO_SEARCH, startDate: "2026-07-10" }, members)).toEqual(["7/10〜"]);
    expect(searchLabels({ ...NO_SEARCH, endDate: "2026-07-10" }, members)).toEqual(["〜7/10"]);
  });
});
