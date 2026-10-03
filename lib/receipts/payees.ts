// 支払い先（docs/分析拡充/基本設計書.md 2.6〜2.7節・3.4〜3.5節）。
// 登録画面・設定画面（クライアント）と Server Action の入力チェックの両方から使うため server-only にはしない。

import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { autoBreakdownIdFor, type CategoryBreakdown } from "@/lib/receipts/breakdowns";
import type { Counterpart, Tag } from "@/lib/receipts/labels";
import type { ReceiptItem } from "@/types/receipt";

// 支払い先の既定値。明細（ReceiptItem）と同じ形の文字列で持ち、"" は「設定しない」。
// ownerUserId は OWNER_JOINT_VALUE（共同）またはメンバーの user id。tagIds は空なら「設定しない」。
export type PayeeDefaults = Pick<
  ReceiptItem,
  "categoryId" | "breakdownId" | "counterpartId" | "ownerUserId" | "tagIds"
>;

export const EMPTY_PAYEE_DEFAULTS: PayeeDefaults = {
  categoryId: "",
  breakdownId: "",
  counterpartId: "",
  ownerUserId: "",
  tagIds: [],
};

export type Payee = {
  id: number;
  name: string;
  // 登録者。null＝グループ全体、値あり＝そのユーザー用
  ownerUserId: string | null;
  // 使われている支払い先は削除できないため、選択肢から外したいときは非表示にする
  isHidden: boolean;
  defaults: PayeeDefaults;
};

// DBの行（payees）を Payee に変換する。
export type PayeeRow = {
  id: number;
  name: string;
  owner_user_id: string | null;
  is_hidden: boolean;
  default_category_id: number | null;
  default_breakdown_id: number | null;
  default_counterpart_id: number | null;
  default_owner_joint: boolean;
  default_owner_user_id: string | null;
  payee_default_tags: { tag_id: number }[];
};

export const PAYEE_SELECT =
  "id, name, owner_user_id, is_hidden, default_category_id, default_breakdown_id, default_counterpart_id, default_owner_joint, default_owner_user_id, payee_default_tags(tag_id)";

export function toPayee(row: PayeeRow): Payee {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    isHidden: row.is_hidden,
    defaults: {
      categoryId: row.default_category_id !== null ? String(row.default_category_id) : "",
      breakdownId: row.default_breakdown_id !== null ? String(row.default_breakdown_id) : "",
      counterpartId: row.default_counterpart_id !== null ? String(row.default_counterpart_id) : "",
      ownerUserId: row.default_owner_joint
        ? OWNER_JOINT_VALUE
        : (row.default_owner_user_id ?? ""),
      tagIds: (row.payee_default_tags ?? []).map((t) => String(t.tag_id)),
    },
  };
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
  };
}

// 登録画面のプルダウンに出す支払い先か。グループ全体と自分用の、非表示でないもの
// （相方用は出さない。基本設計書 3.5節）。
export function isSelectablePayee(payee: Payee, currentUserId: string | undefined): boolean {
  return (
    !payee.isHidden && (payee.ownerUserId === null || payee.ownerUserId === currentUserId)
  );
}

export type PayeeOptionGroups = {
  shared: Payee[]; // グループ全体
  own: Payee[]; // 自分用
  // 編集時に、プルダウンに出ない支払い先（相方用・非表示）が選ばれていれば、その1件
  current: Payee | null;
};

// 登録画面の支払い先のプルダウン。見出しを分けて「グループ全体」「自分用」を出す（基本設計書 2.7節）。
export function payeeOptionGroups(
  payees: Payee[],
  currentUserId: string | undefined,
  selectedPayeeId: string
): PayeeOptionGroups {
  const selectable = payees.filter((p) => isSelectablePayee(p, currentUserId));
  const selected = payees.find((p) => String(p.id) === selectedPayeeId);
  return {
    shared: selectable.filter((p) => p.ownerUserId === null),
    own: selectable.filter((p) => p.ownerUserId !== null),
    current: selected && !isSelectablePayee(selected, currentUserId) ? selected : null,
  };
}

// プルダウンに出ない支払い先が選ばれているときの表示（例：「〇〇薬局（Bさん用）」「〇〇（非表示）」）
export function payeeOptionLabel(
  payee: Payee,
  currentUserId: string | undefined,
  members: { userId: string; displayName: string }[]
): string {
  const notes: string[] = [];
  if (payee.ownerUserId !== null && payee.ownerUserId !== currentUserId) {
    const owner = members.find((m) => m.userId === payee.ownerUserId);
    notes.push(`${owner?.displayName ?? "他のメンバー"}さん用`);
  }
  if (payee.isHidden) {
    notes.push("非表示");
  }
  return notes.length > 0 ? `${payee.name}（${notes.join("・")}）` : payee.name;
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
    defaults.tagIds.length > 0
  );
}

// 設定画面の一覧に出す既定値の説明（例：「水道光熱費 ＞ ガス／ふたり／共同」）。未設定の項目は「―」。
// タグがあれば「／タグ 朝食・夕食」を後ろに付ける（タグの並び順）。
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
