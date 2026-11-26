import { describe, expect, it } from "vitest";

import { OWNER_JOINT_VALUE, REGISTRANT_VALUE } from "@/lib/constants";
import type { CategoryBreakdown } from "@/lib/receipts/breakdowns";
import type { Counterpart, Tag } from "@/lib/receipts/labels";
import {
  applyPayeeDefaults,
  describePayeeDefaults,
  DEFAULT_PAYEE_LIST_FILTER,
  EMPTY_PAYEE_DEFAULTS,
  filterPayees,
  findPayeeByName,
  isPayeeHiddenFor,
  isPayeeHiddenForAll,
  isSelectablePayee,
  ownPayeeDefaults,
  payeeDefaultsFor,
  normalizePayeeName,
  payeeOptionLabel,
  payeeOptions,
  resolveRegistrantDefaults,
  toPayee,
  toPayeeCommonDefaultColumns,
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
    isSpecialExpense: false,
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
    hiddenUserIds: [],
    defaults: EMPTY_PAYEE_DEFAULTS,
    memberDefaults: [],
    aliases: [],
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

describe("商品名の既定値（空の明細にだけ入れる）", () => {
  it("U-142: 商品名が空の明細にだけ既定値の商品名を入れる（空白だけも空とみなす）", () => {
    const withName = defaults({ categoryId: "2", itemName: "ガス代" });
    expect(applyPayeeDefaults(item({ name: "" }), withName, context).name).toBe("ガス代");
    expect(applyPayeeDefaults(item({ name: "  " }), withName, context).name).toBe("ガス代");
  });

  it("U-142: 入力済み・画像で読めた商品名は消さない（ほかの既定値は上書きする）", () => {
    const result = applyPayeeDefaults(
      item({ name: "牛乳", categoryId: "1" }),
      defaults({ categoryId: "2", itemName: "ガス代" }),
      context
    );
    expect(result.name).toBe("牛乳");
    expect(result.categoryId).toBe("2");
  });

  it("U-142: 商品名の既定値がなければ、入力済みの商品名はそのまま", () => {
    expect(applyPayeeDefaults(item({ name: "牛乳" }), defaults(), context).name).toBe("牛乳");
    expect(applyPayeeDefaults(item({ name: "" }), defaults(), context).name).toBe("");
  });

  it("U-142: 一覧の説明に商品名を出す・商品名だけでも既定値ありとみなす", () => {
    const describeContext = { categories, breakdowns, counterparts, tags, members };
    expect(describePayeeDefaults(defaults({ itemName: "ガス代" }), describeContext)).toBe(
      "―／―／―／商品名「ガス代」"
    );
  });
});

describe("payeeDefaultsFor（メンバーが使う既定値）", () => {
  const common = defaults({ categoryId: "1", ownerUserId: OWNER_JOINT_VALUE });
  const ownB = defaults({ categoryId: "2", breakdownId: "21", ownerUserId: USER_B, tagIds: ["8"] });
  const target = payee({ defaults: common, memberDefaults: [{ userId: USER_B, defaults: ownB }] });

  it("U-140: 自分用の既定値があれば自分用、なければ共通の既定値を使う", () => {
    expect(payeeDefaultsFor(target, USER_B)).toEqual(ownB);
    expect(payeeDefaultsFor(target, USER_A)).toEqual(common);
    expect(payeeDefaultsFor(target, undefined)).toEqual(common);
  });

  it("U-140: 自分用の既定値は本人の分だけ返す（相方の分は返さない）", () => {
    expect(ownPayeeDefaults(target, USER_B)).toEqual(ownB);
    expect(ownPayeeDefaults(target, USER_A)).toBeNull();
    expect(ownPayeeDefaults(target, undefined)).toBeNull();
  });

  it("U-140: 自分用の既定値を明細に入れる（共通の既定値の項目は残さない）", () => {
    const result = applyPayeeDefaults(item(), payeeDefaultsFor(target, USER_B), context);
    expect(result).toMatchObject({
      categoryId: "2",
      breakdownId: "21",
      counterpartId: "",
      ownerUserId: USER_B,
      tagIds: ["8"],
    });
  });
});

describe("支払い先のプルダウン", () => {
  // 1＝全員に表示、2＝Bが非表示、3＝Aが非表示、4＝全員が非表示
  const payees = [
    payee({ id: 1, name: "スーパー" }),
    payee({ id: 2, name: "Aの店", hiddenUserIds: [USER_B] }),
    payee({ id: 3, name: "Bの店", hiddenUserIds: [USER_A] }),
    payee({ id: 4, name: "閉店", hiddenUserIds: [USER_A, USER_B] }),
  ];

  it("U-108: 自分が非表示にしていない支払い先だけを選べる（相方の非表示は影響しない）", () => {
    expect(payees.filter((p) => isSelectablePayee(p, USER_A)).map((p) => p.id)).toEqual([1, 2]);
    expect(payees.filter((p) => isSelectablePayee(p, USER_B)).map((p) => p.id)).toEqual([1, 3]);
  });

  it("U-108: 見出しで分けずに1つの一覧で出し、自分が非表示にしたものは選ばれているときだけ残す", () => {
    const result = payeeOptions(payees, USER_A, "");
    expect(result.options.map((p) => p.id)).toEqual([1, 2]);
    expect(result.current).toBeNull();

    expect(payeeOptions(payees, USER_A, "3").current?.id).toBe(3);
    expect(payeeOptions(payees, USER_A, "4").current?.id).toBe(4);
    // プルダウンに出ている支払い先が選ばれていても、追加の選択肢は出さない
    expect(payeeOptions(payees, USER_A, "1").current).toBeNull();
    expect(payeeOptions(payees, USER_A, "2").current).toBeNull();
  });

  it("U-108: 自分が非表示にしている支払い先の表示に「非表示」を添える", () => {
    expect(payeeOptionLabel(payees[2], USER_A)).toBe("Bの店（非表示）");
    expect(payeeOptionLabel(payees[3], USER_A)).toBe("閉店（非表示）");
    // 相方だけが非表示にしている支払い先には添えない
    expect(payeeOptionLabel(payees[1], USER_A)).toBe("Aの店");
    expect(payeeOptionLabel(payees[0], USER_A)).toBe("スーパー");
  });

  it("U-134: メンバーごとの非表示と、全員が非表示かを判定する", () => {
    expect(isPayeeHiddenFor(payees[1], USER_B)).toBe(true);
    expect(isPayeeHiddenFor(payees[1], USER_A)).toBe(false);
    expect(isPayeeHiddenFor(payees[1], undefined)).toBe(false);

    expect(isPayeeHiddenForAll(payees[3], members)).toBe(true);
    expect(isPayeeHiddenForAll(payees[1], members)).toBe(false);
    expect(isPayeeHiddenForAll(payees[0], members)).toBe(false);
    // グループから外れたメンバーの非表示は数えない
    expect(isPayeeHiddenForAll(payee({ hiddenUserIds: [USER_A, "user-gone"] }), members)).toBe(false);
  });
});

describe("既定値の変換・表示・入力チェック", () => {
  it("U-108: DBの行と既定値を相互に変換する（帰属先：設定しない／共同／メンバー）", () => {
    const row = {
      id: 1,
      name: "myTOKYOGAS",
      default_category_id: 2,
      default_breakdown_id: 21,
      default_counterpart_id: 3,
      default_owner_joint: true,
      default_owner_user_id: null,
      default_item_name: "ガス代",
      payee_default_tags: [{ tag_id: 7 }, { tag_id: 8 }],
      payee_aliases: [],
      payee_hidden_members: [{ user_id: USER_B }],
      payee_member_defaults: [
        {
          user_id: USER_B,
          default_category_id: 1,
          default_breakdown_id: null,
          default_counterpart_id: null,
          default_owner_joint: false,
          default_owner_user_id: USER_B,
          default_item_name: null,
          payee_member_default_tags: [{ tag_id: 8 }],
        },
      ],
    };
    const converted = toPayee(row);
    // 自分用の既定値は、メンバーごとに同じ形に変換する
    expect(converted.memberDefaults).toEqual([
      {
        userId: USER_B,
        defaults: {
          categoryId: "1",
          breakdownId: "",
          counterpartId: "",
          ownerUserId: USER_B,
          tagIds: ["8"],
          itemName: "",
        },
      },
    ]);
    expect(converted.hiddenUserIds).toEqual([USER_B]);
    expect(converted.defaults).toEqual({
      categoryId: "2",
      breakdownId: "21",
      counterpartId: "3",
      ownerUserId: OWNER_JOINT_VALUE,
      tagIds: ["7", "8"],
      itemName: "ガス代",
    });
    // タグは別の表に保存するため、列には含めない
    expect(toPayeeDefaultColumns(converted.defaults)).toEqual({
      default_category_id: 2,
      default_breakdown_id: 21,
      default_counterpart_id: 3,
      default_owner_joint: true,
      default_owner_user_id: null,
      default_item_name: "ガス代",
    });
    // 商品名は前後の空白を除き、空なら設定しない
    expect(toPayeeDefaultColumns(defaults({ itemName: "  水道代　" })).default_item_name).toBe(
      "水道代"
    );
    expect(toPayeeDefaultColumns(defaults({ itemName: "  " })).default_item_name).toBeNull();
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

// 分析拡充 F5：支払い先の別名
describe("findPayeeByName（店名に一致する支払い先）", () => {
  const ok = payee({
    id: 1,
    name: "オーケー",
    aliases: [
      { id: 11, name: "オーケー長津田店" },
      { id: 12, name: "オーケー青葉台店" },
    ],
  });
  // 全員が非表示にしている支払い先・自分（A）が非表示にしている支払い先
  const hiddenForAll = payee({
    id: 2,
    name: "閉店した店",
    hiddenUserIds: [USER_A, USER_B],
    aliases: [{ id: 21, name: "閉店" }],
  });
  const hiddenForA = payee({
    id: 4,
    name: "△△書店",
    hiddenUserIds: [USER_A],
    aliases: [{ id: 41, name: "△△" }],
  });
  const payees = [ok, hiddenForAll, hiddenForA];

  it("U-126: 名前か別名が完全一致する支払い先を返す（前後の空白は無視する）", () => {
    expect(findPayeeByName(payees, "オーケー長津田店")).toBe(ok);
    expect(findPayeeByName(payees, "オーケー")).toBe(ok);
    expect(findPayeeByName(payees, "　オーケー青葉台店 \t")).toBe(ok);
  });

  it("U-135: 非表示にしている支払い先（自分だけ・全員）の名前・別名とも一致する", () => {
    expect(findPayeeByName(payees, "△△書店")).toBe(hiddenForA);
    expect(findPayeeByName(payees, "△△")).toBe(hiddenForA);
    expect(findPayeeByName(payees, "閉店")).toBe(hiddenForAll);
  });

  it("U-126: 部分一致・空の店名は一致しない", () => {
    expect(findPayeeByName(payees, "オーケー長津田")).toBeNull();
    expect(findPayeeByName(payees, "オーケー長津田店 2号")).toBeNull();
    expect(findPayeeByName(payees, "")).toBeNull();
    expect(findPayeeByName(payees, "   ")).toBeNull();
  });

  it("U-126: 店名の比較では前後の空白（半角・全角・タブ・改行）だけを除く", () => {
    expect(normalizePayeeName("\u3000 オーケー 長津田\t\n ")).toBe("オーケー 長津田");
  });
});

describe("filterPayees（設定画面の一覧の絞り込み）", () => {
  const own = { userId: USER_A, defaults: defaults({ categoryId: "1" }) };
  const partnerOwn = { userId: USER_B, defaults: defaults({ categoryId: "2" }) };
  const payees = [
    payee({ id: 1, name: "表示・共通" }),
    payee({ id: 2, name: "表示・自分用", memberDefaults: [own] }),
    payee({ id: 3, name: "非表示・共通", hiddenUserIds: [USER_A] }),
    payee({ id: 4, name: "非表示・自分用", hiddenUserIds: [USER_A], memberDefaults: [own] }),
    // 相方だけが非表示・相方だけが自分用（自分にとっては表示・共通）
    payee({ id: 5, name: "相方の設定", hiddenUserIds: [USER_B], memberDefaults: [partnerOwn] }),
  ];
  const ids = (filter: Parameters<typeof filterPayees>[1]) =>
    filterPayees(payees, filter, USER_A).map((p) => p.id);

  it("U-143: 初期値は「表示中・すべて」で、自分が非表示にしている支払い先を出さない", () => {
    expect(DEFAULT_PAYEE_LIST_FILTER).toEqual({ visibility: "visible", defaultsKind: "all" });
    expect(ids(DEFAULT_PAYEE_LIST_FILTER)).toEqual([1, 2, 5]);
  });

  it("U-143: 自分の表示状態で絞り込む（相方の非表示は見ない）", () => {
    expect(ids({ visibility: "hidden", defaultsKind: "all" })).toEqual([3, 4]);
    expect(ids({ visibility: "all", defaultsKind: "all" })).toEqual([1, 2, 3, 4, 5]);
  });

  it("U-143: 既定値の種類で絞り込む（相方の自分用は見ない）。表示状態と組み合わせられる", () => {
    expect(ids({ visibility: "all", defaultsKind: "own" })).toEqual([2, 4]);
    expect(ids({ visibility: "all", defaultsKind: "common" })).toEqual([1, 3, 5]);
    expect(ids({ visibility: "visible", defaultsKind: "own" })).toEqual([2]);
    expect(ids({ visibility: "hidden", defaultsKind: "common" })).toEqual([3]);
  });

  it("U-143: 元の並び順を保ち、元の一覧は変えない", () => {
    const before = payees.map((p) => p.id);
    filterPayees(payees, { visibility: "hidden", defaultsKind: "own" }, USER_A);
    expect(payees.map((p) => p.id)).toEqual(before);
  });
});

// Issue #44：共通の既定値の相手・帰属先「登録する人」
describe("登録する人（Issue #44）", () => {
  // メンバーの相手：1＝A、2＝B（どちらも表示中）
  const memberCounterparts: Counterpart[] = [
    ...counterparts,
    { id: 2, kind: "member", userId: USER_B, name: "B", isHidden: false },
  ];
  const registrant = defaults({
    categoryId: "2",
    counterpartId: REGISTRANT_VALUE,
    ownerUserId: REGISTRANT_VALUE,
  });

  it("U-164: 登録する人を、操作しているメンバー本人に置き換える", () => {
    expect(resolveRegistrantDefaults(registrant, USER_A, memberCounterparts)).toEqual({
      ...registrant,
      counterpartId: "1",
      ownerUserId: USER_A,
    });
    expect(resolveRegistrantDefaults(registrant, USER_B, memberCounterparts)).toEqual({
      ...registrant,
      counterpartId: "2",
      ownerUserId: USER_B,
    });
    // 片方だけ登録する人のときは、もう片方はそのまま
    expect(
      resolveRegistrantDefaults(
        defaults({ counterpartId: "3", ownerUserId: REGISTRANT_VALUE }),
        USER_B,
        memberCounterparts
      )
    ).toMatchObject({ counterpartId: "3", ownerUserId: USER_B });
  });

  it("U-164: 本人のメンバーの相手が非表示・ないときは相手を空欄にし、操作している人が不明ならどちらも空欄", () => {
    const hiddenB = memberCounterparts.map((c) => (c.id === 2 ? { ...c, isHidden: true } : c));
    // 帰属先には非表示がないため、本人が入る
    expect(resolveRegistrantDefaults(registrant, USER_B, hiddenB)).toMatchObject({
      counterpartId: "",
      ownerUserId: USER_B,
    });
    // B のメンバーの相手がない
    expect(resolveRegistrantDefaults(registrant, USER_B, counterparts)).toMatchObject({
      counterpartId: "",
      ownerUserId: USER_B,
    });
    expect(resolveRegistrantDefaults(registrant, undefined, memberCounterparts)).toMatchObject({
      counterpartId: "",
      ownerUserId: "",
    });
  });

  it("U-164: 登録する人を含まない既定値は変えない", () => {
    const plain = defaults({ counterpartId: "3", ownerUserId: OWNER_JOINT_VALUE });
    expect(resolveRegistrantDefaults(plain, USER_A, memberCounterparts)).toBe(plain);
  });

  it("U-165: 同じ支払い先を A・B が選ぶと、それぞれ本人が相手・帰属先に入る", () => {
    const target = payee({ defaults: registrant });
    const fill = (userId: string) =>
      applyPayeeDefaults(
        item(),
        resolveRegistrantDefaults(payeeDefaultsFor(target, userId), userId, memberCounterparts),
        { ...context, counterparts: memberCounterparts }
      );
    expect(fill(USER_A)).toMatchObject({ categoryId: "2", counterpartId: "1", ownerUserId: USER_A });
    expect(fill(USER_B)).toMatchObject({ categoryId: "2", counterpartId: "2", ownerUserId: USER_B });
    // 明細に「登録する人」の値は残らない
    expect(Object.values(fill(USER_B))).not.toContain(REGISTRANT_VALUE);
  });

  it("U-166: DB の列との変換（共通の既定値だけフラグを持つ）", () => {
    const row = {
      id: 1,
      name: "スーパー",
      default_category_id: null,
      default_breakdown_id: null,
      default_counterpart_id: null,
      default_owner_joint: false,
      default_owner_user_id: null,
      default_item_name: null,
      default_counterpart_registrant: true,
      default_owner_registrant: true,
      payee_default_tags: [],
      payee_aliases: [],
      payee_hidden_members: [],
      payee_member_defaults: [],
    };
    expect(toPayee(row).defaults).toMatchObject({
      counterpartId: REGISTRANT_VALUE,
      ownerUserId: REGISTRANT_VALUE,
    });
    // フラグがない（false）行は今までどおり
    expect(
      toPayee({ ...row, default_counterpart_registrant: false, default_owner_registrant: false })
        .defaults
    ).toMatchObject({ counterpartId: "", ownerUserId: "" });

    expect(toPayeeCommonDefaultColumns(registrant)).toEqual({
      default_category_id: 2,
      default_breakdown_id: null,
      default_counterpart_id: null,
      default_owner_joint: false,
      default_owner_user_id: null,
      default_item_name: null,
      default_counterpart_registrant: true,
      default_owner_registrant: true,
    });
    expect(
      toPayeeCommonDefaultColumns(defaults({ counterpartId: "3", ownerUserId: OWNER_JOINT_VALUE }))
    ).toMatchObject({
      default_counterpart_id: 3,
      default_owner_joint: true,
      default_counterpart_registrant: false,
      default_owner_registrant: false,
    });
    // 自分用の列（payee_member_defaults）にはフラグを含めない
    expect(toPayeeDefaultColumns(registrant)).not.toHaveProperty("default_counterpart_registrant");
    expect(toPayeeDefaultColumns(registrant)).toMatchObject({
      default_counterpart_id: null,
      default_owner_user_id: null,
    });
  });

  it("U-167: 一覧の説明と入力チェック（登録する人は共通の既定値でだけ選べる）", () => {
    const describeContext = { categories, breakdowns, counterparts, tags, members };
    expect(
      describePayeeDefaults(
        defaults({ counterpartId: REGISTRANT_VALUE, ownerUserId: REGISTRANT_VALUE }),
        describeContext
      )
    ).toBe("―／登録する人／登録する人");

    const common = { allowRegistrant: true };
    expect(validatePayeeDefaults(registrant, describeContext, undefined, common)).toBeNull();
    // 自分用（許さない）
    expect(
      validatePayeeDefaults(defaults({ counterpartId: REGISTRANT_VALUE }), describeContext)
    ).toBe("相手の既定値が不正です。");
    expect(
      validatePayeeDefaults(defaults({ ownerUserId: REGISTRANT_VALUE }), describeContext)
    ).toBe("帰属先の既定値が不正です。");
  });
});
