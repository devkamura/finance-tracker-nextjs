import { describe, expect, it } from "vitest";

import { OWNER_JOINT_VALUE } from "@/lib/constants";
import type { CategoryBreakdown } from "@/lib/receipts/breakdowns";
import type { Counterpart, Tag } from "@/lib/receipts/labels";
import {
  applyPayeeDefaults,
  describePayeeDefaults,
  EMPTY_PAYEE_DEFAULTS,
  isSelectablePayee,
  payeeOptionGroups,
  payeeOptionLabel,
  toPayee,
  toPayeeDefaultColumns,
  validatePayeeDefaults,
  type Payee,
  type PayeeDefaults,
} from "@/lib/receipts/payees";
import type { ReceiptItem } from "@/types/receipt";

const USER_A = "user-a";
const USER_B = "user-b";

// カテゴリ 1＝食費（内訳：外食・自炊・非表示の間食）、2＝水道光熱費（内訳：ガスだけ）、3＝日用品（内訳なし）
const breakdowns: CategoryBreakdown[] = [
  { id: 11, categoryId: 1, name: "外食", isHidden: false },
  { id: 12, categoryId: 1, name: "自炊", isHidden: false },
  { id: 13, categoryId: 1, name: "間食", isHidden: true },
  { id: 21, categoryId: 2, name: "ガス", isHidden: false },
];
const counterparts: Counterpart[] = [
  { id: 1, kind: "member", userId: USER_A, name: "A", isHidden: false },
  { id: 3, kind: "default", userId: null, name: "ふたり", isHidden: false },
  { id: 5, kind: "default", userId: null, name: "実家", isHidden: true },
];
// タグ 7＝夕食、8＝朝食、9＝昼食（非表示）
const tags: Tag[] = [
  { id: 7, name: "夕食", isHidden: false },
  { id: 8, name: "朝食", isHidden: false },
  { id: 9, name: "昼食", isHidden: true },
];
const members = [
  { userId: USER_A, displayName: "A" },
  { userId: USER_B, displayName: "B" },
];
const categories = [
  { id: 1, name: "食費" },
  { id: 2, name: "水道光熱費" },
  { id: 3, name: "日用品" },
];
const context = { breakdowns, counterparts, tags, members };

function item(overrides: Partial<ReceiptItem> = {}): ReceiptItem {
  return {
    clientId: "1",
    name: "ガス代",
    price: "8000",
    taxType: "inclusive",
    taxRateId: "",
    categoryId: "1",
    breakdownId: "11",
    counterpartId: "1",
    tagIds: ["7"],
    ownerUserId: USER_A,
    ...overrides,
  };
}

function defaults(overrides: Partial<PayeeDefaults> = {}): PayeeDefaults {
  return { ...EMPTY_PAYEE_DEFAULTS, ...overrides };
}

function payee(overrides: Partial<Payee> = {}): Payee {
  return {
    id: 1,
    name: "myTOKYOGAS",
    ownerUserId: null,
    isHidden: false,
    defaults: EMPTY_PAYEE_DEFAULTS,
    ...overrides,
  };
}

describe("applyPayeeDefaults（支払い先の既定値の自動入力）", () => {
  it("U-107: 既定値ですべての項目を上書きする（入力済みの欄も上書き）", () => {
    const result = applyPayeeDefaults(
      item(),
      defaults({
        categoryId: "2",
        breakdownId: "21",
        counterpartId: "3",
        ownerUserId: OWNER_JOINT_VALUE,
        tagIds: ["8"],
      }),
      context
    );
    expect(result).toMatchObject({
      categoryId: "2",
      breakdownId: "21",
      counterpartId: "3",
      ownerUserId: OWNER_JOINT_VALUE,
      tagIds: ["8"],
    });
    // 既定値の対象外の項目はそのまま
    expect(result).toMatchObject({ name: "ガス代", price: "8000", taxType: "inclusive" });
  });

  it("U-107: 既定値のない項目は未選択にする（入力済みの値・前の支払い先の値は残さない）", () => {
    expect(applyPayeeDefaults(item(), defaults({ counterpartId: "3" }), context)).toMatchObject({
      categoryId: "",
      breakdownId: "",
      counterpartId: "3",
      ownerUserId: "",
      tagIds: [],
    });
    // 選び直したとき：前の支払い先で入った値も消える
    const first = applyPayeeDefaults(
      item(),
      defaults({ categoryId: "2", counterpartId: "3", ownerUserId: OWNER_JOINT_VALUE, tagIds: ["7"] }),
      context
    );
    expect(applyPayeeDefaults(first, defaults({ ownerUserId: USER_A }), context)).toMatchObject({
      categoryId: "",
      breakdownId: "",
      counterpartId: "",
      ownerUserId: USER_A,
      tagIds: [],
    });
  });

  it("U-107: 既定値がまったくない支払い先では、すべて未選択にする", () => {
    expect(applyPayeeDefaults(item(), EMPTY_PAYEE_DEFAULTS, context)).toEqual(
      item({ categoryId: "", breakdownId: "", counterpartId: "", ownerUserId: "", tagIds: [] })
    );
  });

  it("U-107: 内訳の既定値がなければ、カテゴリの内訳が1つだけのとき自動で選び、それ以外は未選択", () => {
    expect(applyPayeeDefaults(item(), defaults({ categoryId: "2" }), context)).toMatchObject({
      categoryId: "2",
      breakdownId: "21",
    });
    // カテゴリが同じでも、今の内訳は残さない
    expect(applyPayeeDefaults(item(), defaults({ categoryId: "1" }), context)).toMatchObject({
      categoryId: "1",
      breakdownId: "",
    });
    expect(applyPayeeDefaults(item(), defaults({ categoryId: "3" }), context)).toMatchObject({
      categoryId: "3",
      breakdownId: "",
    });
  });

  it("U-107: 内訳の既定値がカテゴリに属していない・非表示のときは、内訳の既定値を使わない", () => {
    expect(
      applyPayeeDefaults(item(), defaults({ categoryId: "2", breakdownId: "12" }), context)
    ).toMatchObject({ categoryId: "2", breakdownId: "21" });
    expect(
      applyPayeeDefaults(item(), defaults({ categoryId: "1", breakdownId: "13" }), context)
    ).toMatchObject({ categoryId: "1", breakdownId: "" });
  });

  it("U-107: 非表示の相手・タグ、グループにいないメンバーの帰属先は入れず、未選択にする", () => {
    expect(
      applyPayeeDefaults(
        item(),
        defaults({ counterpartId: "5", ownerUserId: "left-user", tagIds: ["9", "99"] }),
        context
      )
    ).toMatchObject({ counterpartId: "", ownerUserId: "", tagIds: [] });
    // 非表示のタグだけを除く
    expect(applyPayeeDefaults(item(), defaults({ tagIds: ["8", "9"] }), context).tagIds).toEqual(["8"]);
  });

  it("U-107: 帰属先の既定値がメンバーなら、そのメンバーにする", () => {
    expect(applyPayeeDefaults(item(), defaults({ ownerUserId: USER_B }), context)).toMatchObject({
      ownerUserId: USER_B,
    });
  });
});

describe("支払い先のプルダウン", () => {
  const payees = [
    payee({ id: 1, name: "スーパー", ownerUserId: null }),
    payee({ id: 2, name: "Aの店", ownerUserId: USER_A }),
    payee({ id: 3, name: "Bの店", ownerUserId: USER_B }),
    payee({ id: 4, name: "閉店", ownerUserId: null, isHidden: true }),
  ];

  it("U-108: グループ全体と自分用の、非表示でない支払い先だけを選べる", () => {
    expect(payees.filter((p) => isSelectablePayee(p, USER_A)).map((p) => p.id)).toEqual([1, 2]);
    expect(payees.filter((p) => isSelectablePayee(p, USER_B)).map((p) => p.id)).toEqual([1, 3]);
  });

  it("U-108: 見出しごとに分け、相方用・非表示は選ばれているときだけ残す", () => {
    const groups = payeeOptionGroups(payees, USER_A, "");
    expect(groups.shared.map((p) => p.id)).toEqual([1]);
    expect(groups.own.map((p) => p.id)).toEqual([2]);
    expect(groups.current).toBeNull();

    expect(payeeOptionGroups(payees, USER_A, "3").current?.id).toBe(3);
    expect(payeeOptionGroups(payees, USER_A, "4").current?.id).toBe(4);
    // プルダウンに出ている支払い先が選ばれていても、追加の選択肢は出さない
    expect(payeeOptionGroups(payees, USER_A, "1").current).toBeNull();
  });

  it("U-108: プルダウンに出ない支払い先の表示に「〇〇さん用」「非表示」を添える", () => {
    expect(payeeOptionLabel(payees[2], USER_A, members)).toBe("Bの店（Bさん用）");
    expect(payeeOptionLabel(payees[3], USER_A, members)).toBe("閉店（非表示）");
    expect(payeeOptionLabel(payee({ name: "x", ownerUserId: USER_B, isHidden: true }), USER_A, members)).toBe(
      "x（Bさん用・非表示）"
    );
    expect(payeeOptionLabel(payees[0], USER_A, members)).toBe("スーパー");
  });
});

describe("既定値の変換・表示・入力チェック", () => {
  it("U-108: DBの行と既定値を相互に変換する（帰属先：設定しない／共同／メンバー）", () => {
    const row = {
      id: 1,
      name: "myTOKYOGAS",
      owner_user_id: null,
      is_hidden: false,
      default_category_id: 2,
      default_breakdown_id: 21,
      default_counterpart_id: 3,
      default_owner_joint: true,
      default_owner_user_id: null,
      payee_default_tags: [{ tag_id: 7 }, { tag_id: 8 }],
    };
    const converted = toPayee(row);
    expect(converted.defaults).toEqual({
      categoryId: "2",
      breakdownId: "21",
      counterpartId: "3",
      ownerUserId: OWNER_JOINT_VALUE,
      tagIds: ["7", "8"],
    });
    // タグは別の表に保存するため、列には含めない
    expect(toPayeeDefaultColumns(converted.defaults)).toEqual({
      default_category_id: 2,
      default_breakdown_id: 21,
      default_counterpart_id: 3,
      default_owner_joint: true,
      default_owner_user_id: null,
    });
    expect(toPayeeDefaultColumns(defaults({ ownerUserId: USER_B }))).toMatchObject({
      default_owner_joint: false,
      default_owner_user_id: USER_B,
    });
    expect(toPayee({ ...row, default_owner_joint: false }).defaults.ownerUserId).toBe("");
    // カテゴリなしで内訳だけは保存しない
    expect(toPayeeDefaultColumns(defaults({ breakdownId: "21" })).default_breakdown_id).toBeNull();
  });

  it("U-108: 一覧の既定値の説明（未設定の項目は「―」、すべて未設定は「なし」）", () => {
    const describeContext = { categories, breakdowns, counterparts, tags, members };
    expect(
      describePayeeDefaults(
        defaults({ categoryId: "2", breakdownId: "21", counterpartId: "3", ownerUserId: OWNER_JOINT_VALUE }),
        describeContext
      )
    ).toBe("水道光熱費 ＞ ガス／ふたり／共同");
    expect(describePayeeDefaults(defaults({ ownerUserId: USER_B }), describeContext)).toBe("―／―／B");
    expect(describePayeeDefaults(EMPTY_PAYEE_DEFAULTS, describeContext)).toBe("なし");
    // タグはタグの並び順で後ろに付ける
    expect(describePayeeDefaults(defaults({ tagIds: ["8", "7"] }), describeContext)).toBe(
      "―／―／―／タグ 夕食・朝食"
    );
  });

  it("U-108: 既定値の入力チェック", () => {
    const validateContext = { categories, breakdowns, counterparts, tags, members };
    const check = (d: Partial<PayeeDefaults>, current?: PayeeDefaults) =>
      validatePayeeDefaults(defaults(d), validateContext, current);

    expect(check({})).toBeNull();
    expect(check({ categoryId: "2", breakdownId: "21", counterpartId: "3", ownerUserId: USER_B })).toBeNull();
    expect(check({ categoryId: "99" })).toBe("カテゴリの既定値が不正です。");
    expect(check({ categoryId: "2", breakdownId: "11" })).toBe("内訳の既定値が不正です。");
    expect(check({ breakdownId: "21" })).toBe("内訳の既定値が不正です。");
    expect(check({ categoryId: "1", breakdownId: "13" })).toBe("内訳の既定値が不正です。");
    expect(check({ counterpartId: "99" })).toBe("相手の既定値が不正です。");
    expect(check({ counterpartId: "5" })).toBe("相手の既定値が不正です。");
    expect(check({ ownerUserId: "left-user" })).toBe("帰属先の既定値が不正です。");
    expect(check({ tagIds: ["7", "8"] })).toBeNull();
    expect(check({ tagIds: ["7", "99"] })).toBe("タグの既定値が不正です。");
    expect(check({ tagIds: ["9"] })).toBe("タグの既定値が不正です。");
    // 非表示の内訳・相手・タグ、グループから外れたメンバーも、保存済みの値ならそのまま残せる
    const current = defaults({
      categoryId: "1",
      breakdownId: "13",
      counterpartId: "5",
      ownerUserId: "left-user",
      tagIds: ["9"],
    });
    expect(check(current, current)).toBeNull();
  });
});
