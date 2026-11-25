import { describe, expect, it } from "vitest";

import {
  buildAnalyticsPayees,
  payeeKeyOf,
  UNREGISTERED_PAYEE_KEY,
} from "@/lib/analytics/payees";
import { EMPTY_PAYEE_DEFAULTS, type Payee } from "@/lib/receipts/payees";

const USER_A = "user-a";
const USER_B = "user-b";
const USER_C = "user-c";

const members = [
  { userId: USER_A, displayName: "ゆうき" },
  { userId: USER_B, displayName: "ふみ" },
  { userId: USER_C, displayName: "あき" },
];

function payee(id: number, name: string, hiddenUserIds: string[] = []): Payee {
  return { id, name, hiddenUserIds, defaults: EMPTY_PAYEE_DEFAULTS, memberDefaults: [], aliases: [] };
}

const ALL = [USER_A, USER_B, USER_C];

describe("buildAnalyticsPayees（分析・一覧の支払い先の選択肢）", () => {
  it("U-129: 見出しで分けず、名前順に並べる", () => {
    const result = buildAnalyticsPayees(
      [payee(1, "マツモトキヨシ"), payee(2, "サイゼリヤ"), payee(3, "ほねごり"), payee(4, "オーケー")],
      members,
      () => false
    );
    expect(result).toEqual([
      { id: 4, name: "オーケー" },
      { id: 2, name: "サイゼリヤ" },
      { id: 3, name: "ほねごり" },
      { id: 1, name: "マツモトキヨシ" },
    ]);
  });

  it("U-129: 一部のメンバーだけが非表示にしている支払い先は、使われていなくても含める", () => {
    const payees = [payee(1, "ほねごり", [USER_A]), payee(2, "マツモトキヨシ", [USER_A, USER_B])];
    expect(buildAnalyticsPayees(payees, members, () => false).map((p) => p.id)).toEqual([1, 2]);
  });

  it("U-129: 全員が非表示にしている支払い先は、レシートで使われているときだけ含める", () => {
    const payees = [payee(1, "閉店した店", ALL), payee(2, "使っていない店", ALL)];
    expect(buildAnalyticsPayees(payees, members, (id) => id === 1).map((p) => p.id)).toEqual([1]);
  });

  it("U-129: レシートの支払い先IDを値にする（紐づいていなければ登録外）", () => {
    expect(payeeKeyOf(15)).toBe("15");
    expect(payeeKeyOf(null)).toBe(UNREGISTERED_PAYEE_KEY);
  });
});
