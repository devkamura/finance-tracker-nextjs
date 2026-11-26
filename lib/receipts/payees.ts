// 支払い先（docs/分析拡充/基本設計書.md 2.6〜2.7節・3.4〜3.5節、
// docs/requirements.md「追加機能：支払い先の一本化」）。
// 支払い先はグループで1つの一覧。プルダウンに出すかどうかはメンバーごとに決める。
// 既定値は、登録したときの内容（共通の既定値）を、メンバーごとに自分用に上書きできる。
// 登録画面・設定画面（クライアント）と Server Action の入力チェックの両方から使うため server-only にはしない。

import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { autoBreakdownIdFor, type CategoryBreakdown } from "@/lib/receipts/breakdowns";
import type { Counterpart, Tag } from "@/lib/receipts/labels";
import type { ReceiptItem } from "@/types/receipt";

// 支払い先の既定値。明細（ReceiptItem）と同じ形の文字列で持ち、"" は「設定しない」。
// ownerUserId は OWNER_JOINT_VALUE（共同）またはメンバーの user id。tagIds は空なら「設定しない」。
// itemName は商品名の既定値（商品名が空の明細にだけ入れる。docs/requirements.md「支払い先の一本化」）。
export type PayeeDefaults = Pick<
  ReceiptItem,
  "categoryId" | "breakdownId" | "counterpartId" | "ownerUserId" | "tagIds"
> & { itemName: string };

export const EMPTY_PAYEE_DEFAULTS: PayeeDefaults = {
  categoryId: "",
  breakdownId: "",
  counterpartId: "",
  ownerUserId: "",
  tagIds: [],
  itemName: "",
};

// 支払い先の別名（手入力・画像読み取りの店名を、この支払い先に寄せる。基本設計書 F5）
export type PayeeAlias = {
  id: number;
  name: string;
};

// メンバーの自分用の既定値（共通の既定値の上書き。一式まるごと持つ）
export type PayeeMemberDefaults = {
  userId: string;
  defaults: PayeeDefaults;
};

export type Payee = {
  id: number;
  name: string;
  // この支払い先を非表示にしているメンバー（そのメンバーのプルダウンに出さない）
  hiddenUserIds: string[];
  // 共通の既定値（登録したときの内容。登録後は変更しない）
  defaults: PayeeDefaults;
  // 自分用の既定値を持つメンバーの分（持たないメンバーには共通の既定値を使う）
  memberDefaults: PayeeMemberDefaults[];
  aliases: PayeeAlias[]; // 名前順
};

// 既定値の列（payees と payee_member_defaults で共通）
type DefaultColumns = {
  default_category_id: number | null;
  default_breakdown_id: number | null;
  default_counterpart_id: number | null;
  default_owner_joint: boolean;
  default_owner_user_id: string | null;
  default_item_name: string | null;
};

// DBの行（payees）を Payee に変換する。
export type PayeeRow = DefaultColumns & {
  id: number;
  name: string;
  payee_default_tags: { tag_id: number }[];
  payee_aliases: { id: number; name: string }[];
  payee_hidden_members: { user_id: string }[];
  payee_member_defaults: (DefaultColumns & {
    user_id: string;
    payee_member_default_tags: { tag_id: number }[];
  })[];
};

const DEFAULT_COLUMNS =
  "default_category_id, default_breakdown_id, default_counterpart_id, default_owner_joint, default_owner_user_id, default_item_name";

export const PAYEE_SELECT = `id, name, ${DEFAULT_COLUMNS}, payee_default_tags(tag_id), payee_aliases(id, name), payee_hidden_members(user_id), payee_member_defaults(user_id, ${DEFAULT_COLUMNS}, payee_member_default_tags(tag_id))`;

// 既定値の列とタグを PayeeDefaults に変換する
function toDefaults(row: DefaultColumns, tags: { tag_id: number }[] | null | undefined): PayeeDefaults {
  return {
    categoryId: row.default_category_id !== null ? String(row.default_category_id) : "",
    breakdownId: row.default_breakdown_id !== null ? String(row.default_breakdown_id) : "",
    counterpartId: row.default_counterpart_id !== null ? String(row.default_counterpart_id) : "",
    ownerUserId: row.default_owner_joint ? OWNER_JOINT_VALUE : (row.default_owner_user_id ?? ""),
    tagIds: (tags ?? []).map((t) => String(t.tag_id)),
    itemName: row.default_item_name ?? "",
  };
}

export function toPayee(row: PayeeRow): Payee {
  return {
    id: row.id,
    name: row.name,
    hiddenUserIds: (row.payee_hidden_members ?? []).map((h) => h.user_id),
    defaults: toDefaults(row, row.payee_default_tags),
    memberDefaults: (row.payee_member_defaults ?? []).map((m) => ({
      userId: m.user_id,
      defaults: toDefaults(m, m.payee_member_default_tags),
    })),
    aliases: (row.payee_aliases ?? [])
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja")),
  };
}

// そのメンバーの自分用の既定値。持っていなければ null。
export function ownPayeeDefaults(payee: Payee, userId: string | undefined): PayeeDefaults | null {
  if (userId === undefined) return null;
  return payee.memberDefaults.find((m) => m.userId === userId)?.defaults ?? null;
}

// そのメンバーが使う既定値（自分用があれば自分用、なければ共通の既定値）
export function payeeDefaultsFor(payee: Payee, userId: string | undefined): PayeeDefaults {
  return ownPayeeDefaults(payee, userId) ?? payee.defaults;
}

// 店名の比較用に、前後の空白（半角・全角）を除く。DBの normalize_payee_name と同じ規則。
export function normalizePayeeName(name: string): string {
  return name.trim();
}

// 店名（手入力・画像読み取り）に一致する支払い先を探す。名前か別名が完全一致（前後の空白は無視）する、
// グループのすべての支払い先を対象にする（自分が非表示にしているものも含む。同じ店が分析で
// 「登録済み」と「登録外」に分かれないようにするため）。
// 名前・別名はグループの中で重複できないため、一致するのは多くても1件。
export function findPayeeByName(payees: Payee[], name: string): Payee | null {
  const normalized = normalizePayeeName(name);
  if (!normalized) return null;
  return (
    payees.find(
      (payee) => payee.name === normalized || payee.aliases.some((a) => a.name === normalized)
    ) ?? null
  );
}

// 既定値を DB の列に変換する（Server Action で保存するとき）。
// タグは payee_default_tags に別に保存するため含めない。
export function toPayeeDefaultColumns(defaults: PayeeDefaults) {
  return {
    default_category_id: defaults.categoryId ? Number(defaults.categoryId) : null,
    // 内訳はカテゴリの既定値があるときだけ（DBの制約と同じ）
    default_breakdown_id:
      defaults.categoryId && defaults.breakdownId ? Number(defaults.breakdownId) : null,
    default_counterpart_id: defaults.counterpartId ? Number(defaults.counterpartId) : null,
    default_owner_joint: defaults.ownerUserId === OWNER_JOINT_VALUE,
    default_owner_user_id:
      defaults.ownerUserId && defaults.ownerUserId !== OWNER_JOINT_VALUE
        ? defaults.ownerUserId
        : null,
    // 前後の空白は除き、空なら設定しない
    default_item_name: defaults.itemName.trim() || null,
  };
}

// そのメンバーが支払い先を非表示にしているか
export function isPayeeHiddenFor(payee: Payee, userId: string | undefined): boolean {
  return userId !== undefined && payee.hiddenUserIds.includes(userId);
}

// グループのメンバー全員が非表示にしているか（分析の選択肢で、使われていなければ出さない）
export function isPayeeHiddenForAll(payee: Payee, members: { userId: string }[]): boolean {
  return members.length > 0 && members.every((m) => payee.hiddenUserIds.includes(m.userId));
}

// 登録画面のプルダウンに出す支払い先か。自分が非表示にしていないもの。
export function isSelectablePayee(payee: Payee, currentUserId: string | undefined): boolean {
  return !isPayeeHiddenFor(payee, currentUserId);
}

export type PayeeOptions = {
  options: Payee[]; // プルダウンに出す支払い先
  // 編集時に、プルダウンに出ない支払い先（自分が非表示にしているもの）が選ばれていれば、その1件
  current: Payee | null;
};

// 登録画面の支払い先のプルダウン。自分が非表示にしていない支払い先を出す。
export function payeeOptions(
  payees: Payee[],
  currentUserId: string | undefined,
  selectedPayeeId: string
): PayeeOptions {
  const selected = payees.find((p) => String(p.id) === selectedPayeeId);
  return {
    options: payees.filter((p) => isSelectablePayee(p, currentUserId)),
    current: selected && !isSelectablePayee(selected, currentUserId) ? selected : null,
  };
}

// プルダウンに出ない支払い先が選ばれているときの表示（例：「〇〇（非表示）」）
export function payeeOptionLabel(payee: Payee, currentUserId: string | undefined): string {
  return isPayeeHiddenFor(payee, currentUserId) ? `${payee.name}（非表示）` : payee.name;
}

type DefaultsContext = {
  breakdowns: CategoryBreakdown[];
  counterparts: Counterpart[];
  tags: Tag[];
  members: { userId: string }[];
};

// 明細に支払い先の既定値を入れる（基本設計書 3.4節）。
// カテゴリ・内訳・相手・帰属先・タグをすべて上書きし、既定値のない項目は未選択（空）にする
// （前の支払い先の既定値や入力済みの値は残さない。2026-10-03 ユーザー確認済み）。
// - 内訳：内訳の既定値があればそれ、なければカテゴリの内訳が1つだけのとき自動で選ぶ
// - 既定値の内訳がカテゴリに属していない・非表示、相手が非表示、帰属先のメンバーがグループにいない、
//   タグが非表示のときは、その既定値は使わない（未選択にする）
// - 商品名だけは、明細の商品名が空のときにだけ入れる（入力済み・画像で読めた商品名は消さない。
//   既定値がなければ何もしない。2026-11-25 ユーザー確認済み）
export function applyPayeeDefaults(
  item: ReceiptItem,
  defaults: PayeeDefaults,
  context: DefaultsContext
): ReceiptItem {
  const defaultBreakdown = context.breakdowns.find(
    (b) =>
      String(b.id) === defaults.breakdownId &&
      String(b.categoryId) === defaults.categoryId &&
      !b.isHidden
  );
  const breakdownId = !defaults.categoryId
    ? ""
    : defaultBreakdown
      ? String(defaultBreakdown.id)
      : autoBreakdownIdFor(defaults.categoryId, context.breakdowns);

  const counterpartId = context.counterparts.some(
    (c) => String(c.id) === defaults.counterpartId && !c.isHidden
  )
    ? defaults.counterpartId
    : "";

  const ownerUserId =
    defaults.ownerUserId === OWNER_JOINT_VALUE ||
    context.members.some((m) => m.userId === defaults.ownerUserId)
      ? defaults.ownerUserId
      : "";

  const tagIds = defaults.tagIds.filter((id) =>
    context.tags.some((t) => String(t.id) === id && !t.isHidden)
  );

  return {
    ...item,
    name: item.name.trim() === "" ? defaults.itemName : item.name,
    categoryId: defaults.categoryId,
    breakdownId,
    counterpartId,
    ownerUserId,
    tagIds,
  };
}

// 既定値が設定されているか
export function hasPayeeDefaults(defaults: PayeeDefaults): boolean {
  return (
    defaults.categoryId !== "" ||
    defaults.breakdownId !== "" ||
    defaults.counterpartId !== "" ||
    defaults.ownerUserId !== "" ||
    defaults.tagIds.length > 0 ||
    defaults.itemName.trim() !== ""
  );
}

// 設定画面の一覧に出す既定値の説明（例：「水道光熱費 ＞ ガス／ふたり／共同」）。未設定の項目は「―」。
// タグがあれば「／タグ 朝食・夕食」、商品名があれば「／商品名「ガス代」」を後ろに付ける（タグの並び順）。
export function describePayeeDefaults(
  defaults: PayeeDefaults,
  context: {
    categories: { id: number; name: string }[];
    breakdowns: CategoryBreakdown[];
    counterparts: Counterpart[];
    tags: Tag[];
    members: { userId: string; displayName: string }[];
  }
): string {
  if (!hasPayeeDefaults(defaults)) {
    return "なし";
  }
  const category = context.categories.find((c) => String(c.id) === defaults.categoryId);
  const breakdown = context.breakdowns.find((b) => String(b.id) === defaults.breakdownId);
  const counterpart = context.counterparts.find((c) => String(c.id) === defaults.counterpartId);
  const owner =
    defaults.ownerUserId === OWNER_JOINT_VALUE
      ? "共同"
      : context.members.find((m) => m.userId === defaults.ownerUserId)?.displayName;

  const categoryLabel = category
    ? breakdown
      ? `${category.name} ＞ ${breakdown.name}`
      : category.name
    : "―";
  const tagNames = context.tags
    .filter((t) => defaults.tagIds.includes(String(t.id)))
    .map((t) => t.name);
  const parts = [categoryLabel, counterpart?.name ?? "―", owner ?? "―"];
  if (tagNames.length > 0) {
    parts.push(`タグ ${tagNames.join("・")}`);
  }
  if (defaults.itemName.trim() !== "") {
    parts.push(`商品名「${defaults.itemName.trim()}」`);
  }
  return parts.join("／");
}

// 既定値の入力チェック（設定画面の Server Action）。問題がなければ null。
// 非表示の内訳・相手は、新しく選ぶことはできないが、保存済みの値としては残せる。
export function validatePayeeDefaults(
  defaults: PayeeDefaults,
  context: {
    categories: { id: number }[];
    breakdowns: CategoryBreakdown[];
    counterparts: Counterpart[];
    tags: Tag[];
    members: { userId: string }[];
  },
  current: PayeeDefaults = EMPTY_PAYEE_DEFAULTS
): string | null {
  if (defaults.categoryId && !context.categories.some((c) => String(c.id) === defaults.categoryId)) {
    return "カテゴリの既定値が不正です。";
  }
  if (defaults.breakdownId) {
    const breakdown = context.breakdowns.find(
      (b) => String(b.id) === defaults.breakdownId && String(b.categoryId) === defaults.categoryId
    );
    if (!breakdown || (breakdown.isHidden && defaults.breakdownId !== current.breakdownId)) {
      return "内訳の既定値が不正です。";
    }
  }
  if (defaults.counterpartId) {
    const counterpart = context.counterparts.find((c) => String(c.id) === defaults.counterpartId);
    if (
      !counterpart ||
      (counterpart.isHidden && defaults.counterpartId !== current.counterpartId)
    ) {
      return "相手の既定値が不正です。";
    }
  }
  if (
    defaults.ownerUserId &&
    defaults.ownerUserId !== OWNER_JOINT_VALUE &&
    defaults.ownerUserId !== current.ownerUserId &&
    !context.members.some((m) => m.userId === defaults.ownerUserId)
  ) {
    return "帰属先の既定値が不正です。";
  }
  const invalidTag = defaults.tagIds.some((id) => {
    const tag = context.tags.find((t) => String(t.id) === id);
    return !tag || (tag.isHidden && !current.tagIds.includes(id));
  });
  if (invalidTag) {
    return "タグの既定値が不正です。";
  }
  return null;
}

// 設定画面の一覧の絞り込み（画面の中だけで行い、サーバーには問い合わせない）。
// visibility：自分の表示状態（"visible"＝自分のプルダウンに出す／"hidden"＝自分が非表示にしている／"all"）
// defaultsKind：既定値の種類（"own"＝自分用の既定値を持つ／"common"＝共通の既定値を使う／"all"）
export type PayeeVisibilityFilter = "visible" | "hidden" | "all";
export type PayeeDefaultsKindFilter = "own" | "common" | "all";

export type PayeeListFilter = {
  visibility: PayeeVisibilityFilter;
  defaultsKind: PayeeDefaultsKindFilter;
};

// 画面を開いたときの絞り込み。自分が使う（表示中の）支払い先だけを出す
export const DEFAULT_PAYEE_LIST_FILTER: PayeeListFilter = {
  visibility: "visible",
  defaultsKind: "all",
};

export function filterPayees(
  payees: Payee[],
  filter: PayeeListFilter,
  currentUserId: string | undefined
): Payee[] {
  return payees.filter((payee) => {
    const hidden = isPayeeHiddenFor(payee, currentUserId);
    if (filter.visibility === "visible" && hidden) return false;
    if (filter.visibility === "hidden" && !hidden) return false;
    const own = ownPayeeDefaults(payee, currentUserId) !== null;
    if (filter.defaultsKind === "own" && !own) return false;
    if (filter.defaultsKind === "common" && own) return false;
    return true;
  });
}
