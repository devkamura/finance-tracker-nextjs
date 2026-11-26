// レシート一覧のフィルタ（Issue #39。docs/全体仕様書/要件定義書.md 4.5節）。
// 一覧画面で自分で選ぶ条件のうち、レシート単位で判定するもの（支払者・期間・キーワード）を扱う。
// 負担者（scope・joint）とカテゴリなどの明細単位の条件は、分析画面からの絞り込みと同じ
// lib/receipts/list-params.ts（parseListFilter）と lib/analytics/drilldown.ts で扱う。
// 画面側（Client Component）で使うため server-only にはしない。

import type { ReceiptListItem } from "@/types/receipt";

// URLのパラメータ名（list-params.ts の LIST_PARAM_KEYS にも含め、詳細画面との行き来で引き継ぐ）
export const SEARCH_PARAM_KEYS = ["payer", "start", "end", "q"] as const;
export type SearchParamKey = (typeof SEARCH_PARAM_KEYS)[number];

// 月を切り替えたときに外す条件（期間は選んでいる月の中でしか指定できないため）
export const MONTH_SCOPED_PARAM_KEYS: readonly SearchParamKey[] = ["start", "end"];

export type ReceiptListSearch = {
  payerUserId: string | null; // 支払者（立替者）
  startDate: string | null; // "YYYY-MM-DD"（その日を含む）
  endDate: string | null; // "YYYY-MM-DD"（その日を含む）
  keyword: string | null; // 前後の空白を除いた入力値（表示用）
};

type RawSearchParams = Partial<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// "YYYY-MM" の月の初日・末日を "YYYY-MM-DD" で返す（日付入力の min・max に使う）
export function monthDateRange(month: string): { min: string; max: string } {
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  return { min: `${month}-01`, max: `${month}-${String(lastDay).padStart(2, "0")}` };
}

// 期間の日付として正しいか（実在する日付で、選んでいる月の中にあるか）
function isDateInMonth(value: string, month: string): boolean {
  const matched = DATE_PATTERN.exec(value);
  if (!matched) return false;
  const [, y, m, d] = matched.map(Number);
  const date = new Date(y, m - 1, d);
  // 2026-02-31 のような存在しない日付を弾く
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return false;
  return value.startsWith(`${month}-`);
}

// 一覧のURLパラメータから、レシート単位の条件を読み取る。条件がなければnull。
// グループ外のユーザー・選んでいる月の外の日付・不正な日付は無視する（その条件では絞らない）。
// 開始日が終了日より後のときは入れ替える（入力の順番を間違えても目的の期間で絞れるように）。
export function parseListSearch(
  searchParams: RawSearchParams,
  month: string,
  members: { userId: string }[]
): ReceiptListSearch | null {
  const payer = firstValue(searchParams.payer);
  const payerUserId = members.some((m) => m.userId === payer) ? payer! : null;

  const start = firstValue(searchParams.start);
  const end = firstValue(searchParams.end);
  let startDate = start && isDateInMonth(start, month) ? start : null;
  let endDate = end && isDateInMonth(end, month) ? end : null;
  if (startDate && endDate && startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  const keyword = firstValue(searchParams.q)?.trim() || null;

  if (!payerUserId && !startDate && !endDate && !keyword) return null;
  return { payerUserId, startDate, endDate, keyword };
}

// レシートの日時（timestamptz のISO文字列）を日本時間の "YYYY-MM-DD" にする。
// 月の区切り（サーバーは TZ=Asia/Tokyo で判定）と合わせるため、閲覧端末のタイムゾーンによらず日本時間で比べる。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function toJstDateString(occurredAt: string): string {
  return new Date(Date.parse(occurredAt) + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// キーワードの比較用の正規化。全角・半角の英数字やカナ（NFKC）と、英字の大文字・小文字の違いをなくす。
export function normalizeKeyword(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

type SearchableReceipt = Pick<ReceiptListItem, "occurredAt" | "payerUserId" | "payeeName"> & {
  items: { itemName: string }[];
};

// レシートがすべての条件に当てはまるか（AND）。
// キーワードは支払い先名か、いずれかの明細の商品名に含まれていれば当てはまる（部分一致）。
export function matchesSearch(receipt: SearchableReceipt, search: ReceiptListSearch): boolean {
  if (search.payerUserId && receipt.payerUserId !== search.payerUserId) return false;

  if (search.startDate || search.endDate) {
    const date = toJstDateString(receipt.occurredAt);
    if (search.startDate && date < search.startDate) return false;
    if (search.endDate && date > search.endDate) return false;
  }

  if (search.keyword) {
    const keyword = normalizeKeyword(search.keyword);
    const targets = [receipt.payeeName, ...receipt.items.map((i) => i.itemName)];
    if (!targets.some((t) => normalizeKeyword(t).includes(keyword))) return false;
  }

  return true;
}

// "YYYY-MM-DD" → "M/D"
function shortDate(value: string): string {
  const [, m, d] = value.split("-").map(Number);
  return `${m}/${d}`;
}

// 絞り込み中の表示に使う、条件ごとの表示名（「支払者：A」「10/1〜10/7」「「コーヒー」を含む」）
export function searchLabels(
  search: ReceiptListSearch,
  members: { userId: string; displayName: string }[]
): string[] {
  const labels: string[] = [];
  if (search.payerUserId) {
    const name = members.find((m) => m.userId === search.payerUserId)?.displayName ?? "";
    labels.push(`支払者：${name}`);
  }
  if (search.startDate || search.endDate) {
    const from = search.startDate ? shortDate(search.startDate) : "";
    const to = search.endDate ? shortDate(search.endDate) : "";
    labels.push(`${from}〜${to}`);
  }
  if (search.keyword) labels.push(`「${search.keyword}」を含む`);
  return labels;
}

// ---- フィルタ欄の操作（画面の状態＝URLパラメータの組を書き換える純粋関数） ----

// 一覧の条件のURLパラメータ（値なしの項目は持たない）
export type ListConditionParams = Partial<Record<string, string>>;

// ユーザーの基準。支払者＝立替者（payer）、負担者＝分析の表示対象と同じ（scope・joint）
export type UserBasis = "payer" | "burden";

export type UserSelection = {
  userId: string | null; // null＝全員
  basis: UserBasis;
  includeJoint: boolean; // 負担者のときだけ使う
};

// フィルタ欄に表示するユーザーの選択を、URLパラメータから読み取る。
// どちらも指定がなければ全員（基準は fallbackBasis＝画面で最後に選んでいた基準）。
export function readUserSelection(
  params: ListConditionParams,
  members: { userId: string }[],
  fallbackBasis: UserBasis
): UserSelection {
  const isMember = (id: string | undefined) => !!id && members.some((m) => m.userId === id);
  if (isMember(params.payer)) {
    return { userId: params.payer!, basis: "payer", includeJoint: false };
  }
  if (isMember(params.scope)) {
    return { userId: params.scope!, basis: "burden", includeJoint: params.joint === "1" };
  }
  return { userId: null, basis: fallbackBasis, includeJoint: false };
}

// ユーザーの選択をURLパラメータに反映する。支払者と負担者は同時には指定しない。
// 全員を選んだときは、分析画面から渡された「全体」（scope=all）も外す
// （カテゴリなどの条件が残っていれば、parseListFilter が全体として扱う）。
export function withUserSelection(
  params: ListConditionParams,
  selection: UserSelection
): ListConditionParams {
  const next: ListConditionParams = { ...params };
  delete next.payer;
  delete next.scope;
  delete next.joint;
  if (selection.userId) {
    if (selection.basis === "payer") {
      next.payer = selection.userId;
    } else {
      next.scope = selection.userId;
      if (selection.includeJoint) next.joint = "1";
    }
  }
  return next;
}

// フィルタ欄で使っている条件の数（ユーザー・期間・キーワードをそれぞれ1つと数える）。
// 欄を閉じているときにボタンに出す。
export function countPanelConditions(
  params: ListConditionParams,
  members: { userId: string }[]
): number {
  const user = readUserSelection(params, members, "payer").userId ? 1 : 0;
  const period = params.start || params.end ? 1 : 0;
  const keyword = params.q?.trim() ? 1 : 0;
  return user + period + keyword;
}
