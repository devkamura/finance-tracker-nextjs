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

function payee(id: number, name: string, ownerUserId: string | null, isHidden = false): Payee {
  return { id, name, ownerUserId, isHidden, defaults: EMPTY_PAYEE_DEFAULTS, aliases: [] };
}

describe("buildAnalyticsPayees（分析・一覧の支払い先の選択肢）", () => {
  it("U-129: グループ全体 → 自分用 → 相方の自分用 の順、見出しの中は名前順に並べる", () => {
    const result = buildAnalyticsPayees(
      [
        payee(1, "マツモトキヨシ", USER_B),
        payee(2, "サイゼリヤ", null),
        payee(3, "ほねごり", USER_A),
        payee(4, "オーケー", null),
        payee(5, "本屋", USER_C),
        payee(6, "ドラッグ", USER_B),
      ],
      USER_A,
      members,
      () => false
    );
    expect(result).toEqual([
      { id: 4, name: "オーケー", section: "shared", sectionLabel: "グループ全体" },
      { id: 2, name: "サイゼリヤ", section: "shared", sectionLabel: "グループ全体" },
      { id: 3, name: "ほねごり", section: "own", sectionLabel: "自分用" },
      // 相方が複数いても相方ごとにまとめる
      { id: 5, name: "本屋", section: "partner", sectionLabel: "あきさんの自分用" },
      { id: 6, name: "ドラッグ", section: "partner", sectionLabel: "ふみさんの自分用" },
      { id: 1, name: "マツモトキヨシ", section: "partner", sectionLabel: "ふみさんの自分用" },
    ]);
  });

  it("U-129: 見出しはログインしているユーザーから見た自分用・相方の自分用になる", () => {
    const payees = [payee(1, "ほねごり", USER_A), payee(2, "マツモトキヨシ", USER_B)];
    expect(buildAnalyticsPayees(payees, USER_B, members, () => false).map((p) => p.sectionLabel)).toEqual([
      "自分用",
      "ゆうきさんの自分用",
    ]);
    // グループから外れたメンバーの自分用
    expect(
      buildAnalyticsPayees([payee(9, "古い店", "user-gone")], USER_A, members, () => false)[0]
        .sectionLabel
    ).toBe("他のメンバーさんの自分用");
  });

  it("U-129: 非表示の支払い先は、レシートで使われているときだけ含める", () => {
    const payees = [payee(1, "閉店した店", null, true), payee(2, "使っていない店", null, true)];
    expect(buildAnalyticsPayees(payees, USER_A, members, (id) => id === 1).map((p) => p.id)).toEqual([
      1,
    ]);
  });

  it("U-129: レシートの支払い先IDを値にする（紐づいていなければ登録外）", () => {
    expect(payeeKeyOf(15)).toBe("15");
    expect(payeeKeyOf(null)).toBe(UNREGISTERED_PAYEE_KEY);
  });
});
