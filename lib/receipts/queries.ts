import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { OWNER_JOINT_VALUE, SELECT_NONE_VALUE } from "@/lib/constants";
import { getGroupMembers } from "@/lib/supabase/group";
import { getReceiptImageSignedUrl } from "@/lib/supabase/storage";
import { unwrapToOne } from "@/lib/supabase/unwrap";
import type {
  ReceiptDetailItemView,
  ReceiptDetailView,
  ReceiptFormState,
  ReceiptItem,
  ReceiptListItem,
} from "@/types/receipt";

export type Period = { from: Date; to: Date }; // [from, to) の半開区間

// 暦月単位の期間を返す（要件定義書28章）。引数省略時は当月。
export function monthPeriod(base: Date = new Date()): Period {
  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return { from, to };
}

// settlement_periods.period_month（月初日）の文字列表現("YYYY-MM-01")を返す。
export function toPeriodMonthString(base: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-01`;
}

// データは当月から遡って12ヶ月分のみ保持する運用のため、月選択UIで選べる範囲を
// [当月-11ヶ月, 当月]に制限する（データの自動削除自体は今回のスコープ外）。
const RETENTION_MONTHS = 12;

export function retentionMonthRange(base: Date = new Date()): {
  min: Date;
  max: Date;
} {
  const max = new Date(base.getFullYear(), base.getMonth(), 1);
  const min = new Date(base.getFullYear(), base.getMonth() - (RETENTION_MONTHS - 1), 1);
  return { min, max };
}

function clampToRetentionRange(date: Date): Date {
  const { min, max } = retentionMonthRange();
  if (date.getTime() < min.getTime()) return min;
  if (date.getTime() > max.getTime()) return max;
  return date;
}

// URLクエリ等で受け取る"YYYY-MM"形式の月指定を、その月1日のDateに変換する。
// 不正な値・省略時は当月にフォールバックし、保持期間の範囲外（当月から12ヶ月より
// 過去、または未来）が指定された場合は範囲内にクランプする。
export function parseMonthParam(month: string | undefined): Date {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      return clampToRetentionRange(new Date(year, m - 1, 1));
    }
  }
  return new Date();
}

// "YYYY-MM"形式の文字列を返す（月選択UIのURLクエリ・<input type="month">用）。
export function toMonthParam(base: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}`;
}

type MemberInfo = { displayName: string; color: string | null };

// receipts/receipt_detailsにはprofilesへの直接の外部キーがない
// （どちらもauth.usersを介した間接参照のため、PostgRESTのネスト選択で
// 自動結合できない）。グループの人数は最大2人と小さいため、
// getGroupMembers()の結果をメモリ上でuserId→表示名/色に変換して補う。
function buildMemberInfoMap(
  members: { userId: string; displayName: string; color: string | null }[]
): Map<string, MemberInfo> {
  return new Map(
    members.map((m) => [m.userId, { displayName: m.displayName, color: m.color }])
  );
}

type RawReceiptDetail = {
  id: string;
  item_name: string;
  price: number;
  tax_type: "inclusive" | "exclusive";
  owner_user_id: string | null;
  consumption_taxes: { name: string } | { name: string }[] | null;
  categories: { name: string } | { name: string }[] | null;
  purposes: { name: string } | { name: string }[] | null;
  receipt_detail_scenes: {
    scenes: { name: string } | { name: string }[] | null;
  }[];
};

const RECEIPT_WITH_DETAILS_SELECT = `id, occurred_at, store_name, amount, payer_user_id, receipt_image_path,
   transaction_types(name),
   receipt_details(
     id, item_name, price, tax_type, owner_user_id,
     consumption_taxes(name), categories(name), purposes(name),
     receipt_detail_scenes(scenes(name))
   )`;

function mapReceiptDetailItems(
  rawDetails: RawReceiptDetail[],
  memberInfo: Map<string, MemberInfo>
): ReceiptDetailItemView[] {
  return rawDetails.map((detail) => ({
    id: detail.id,
    itemName: detail.item_name,
    price: detail.price,
    taxType: detail.tax_type,
    taxRateName: unwrapToOne(detail.consumption_taxes)?.name ?? null,
    categoryName: unwrapToOne(detail.categories)?.name ?? "",
    purposeName: unwrapToOne(detail.purposes)?.name ?? "",
    ownerUserId: detail.owner_user_id,
    ownerDisplayName:
      detail.owner_user_id === null
        ? "共同"
        : (memberInfo.get(detail.owner_user_id)?.displayName ?? "unknown"),
    ownerColor:
      detail.owner_user_id === null
        ? null
        : (memberInfo.get(detail.owner_user_id)?.color ?? null),
    sceneNames: detail.receipt_detail_scenes
      .map((s) => unwrapToOne(s.scenes)?.name)
      .filter((name): name is string => Boolean(name)),
  }));
}

// 一覧画面は明細をアコーディオンでその場に展開して確認できるようにするため、
// 詳細画面（getReceiptDetail）相当の情報をまとめて取得する。
export async function listReceipts(
  supabase: SupabaseClient,
  groupId: string,
  period: Period,
  sort: "asc" | "desc" = "desc"
): Promise<ReceiptListItem[]> {
  const [{ data, error }, members] = await Promise.all([
    supabase
      .from("receipts")
      .select(RECEIPT_WITH_DETAILS_SELECT)
      .eq("group_id", groupId)
      .gte("occurred_at", period.from.toISOString())
      .lt("occurred_at", period.to.toISOString())
      .order("occurred_at", { ascending: sort === "asc" }),
    getGroupMembers(supabase, groupId),
  ]);

  if (error || !data) {
    console.error("Failed to list receipts", error);
    return [];
  }

  const memberInfo = buildMemberInfoMap(members);

  return Promise.all(
    data.map(async (row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      storeName: row.store_name,
      amount: row.amount,
      transactionTypeName: unwrapToOne(row.transaction_types)?.name ?? "",
      payerUserId: row.payer_user_id,
      payerDisplayName: memberInfo.get(row.payer_user_id)?.displayName ?? "unknown",
      payerColor: memberInfo.get(row.payer_user_id)?.color ?? null,
      receiptImageUrl: row.receipt_image_path
        ? await getReceiptImageSignedUrl(supabase, row.receipt_image_path)
        : null,
      items: mapReceiptDetailItems(
        (row.receipt_details ?? []) as unknown as RawReceiptDetail[],
        memberInfo
      ),
    }))
  );
}

export async function getReceiptDetail(
  supabase: SupabaseClient,
  groupId: string,
  receiptId: string
): Promise<ReceiptDetailView | null> {
  const [{ data: receipt, error }, members] = await Promise.all([
    supabase
      .from("receipts")
      .select(RECEIPT_WITH_DETAILS_SELECT)
      .eq("id", receiptId)
      .eq("group_id", groupId)
      .maybeSingle(),
    getGroupMembers(supabase, groupId),
  ]);

  if (error || !receipt) {
    if (error) console.error("Failed to fetch receipt detail", error);
    return null;
  }

  const memberInfo = buildMemberInfoMap(members);

  const { data: confirmed } = await supabase.rpc("is_settlement_confirmed", {
    p_group_id: groupId,
    p_occurred_at: receipt.occurred_at,
  });

  const imageUrl = receipt.receipt_image_path
    ? await getReceiptImageSignedUrl(supabase, receipt.receipt_image_path)
    : null;

  const items = mapReceiptDetailItems(
    (receipt.receipt_details ?? []) as unknown as RawReceiptDetail[],
    memberInfo
  );

  return {
    id: receipt.id,
    occurredAt: receipt.occurred_at,
    storeName: receipt.store_name,
    amount: receipt.amount,
    transactionTypeName: unwrapToOne(receipt.transaction_types)?.name ?? "",
    payerUserId: receipt.payer_user_id,
    payerDisplayName: memberInfo.get(receipt.payer_user_id)?.displayName ?? "unknown",
    payerColor: memberInfo.get(receipt.payer_user_id)?.color ?? null,
    receiptImageUrl: imageUrl,
    isLocked: Boolean(confirmed),
    items,
  };
}

// occurred_at(timestamptz)を<input type="datetime-local">互換の
// "YYYY-MM-DDTHH:mm"（サーバーのローカル時刻基準）に変換する。
// レシート登録時（build-receipt-json由来のtoYYYYMMDDHHmmと同じ考え方）の逆変換にあたる。
function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type ReceiptEditData = {
  state: ReceiptFormState;
  receiptImageUrl: string | null;
  isLocked: boolean;
};

type RawEditDetail = {
  id: string;
  item_name: string;
  price: number;
  tax_type: "inclusive" | "exclusive";
  tax_rate_id: number | null;
  category_id: number;
  purpose_id: number;
  owner_user_id: string | null;
  receipt_detail_scenes: { scene_id: number }[];
};

// レシート編集フォームの初期値（IDベース）を取得する。getReceiptDetailは
// 表示用に名称解決済みのビューを返すため、編集フォームの再構築には使えない。
export async function getReceiptForEdit(
  supabase: SupabaseClient,
  groupId: string,
  receiptId: string
): Promise<ReceiptEditData | null> {
  const { data: receipt, error } = await supabase
    .from("receipts")
    .select(
      `id, occurred_at, store_id, store_name, transaction_type_id, amount, receipt_image_path,
       receipt_details(
         id, item_name, price, tax_type, tax_rate_id, category_id, purpose_id, owner_user_id,
         receipt_detail_scenes(scene_id)
       )`
    )
    .eq("id", receiptId)
    .eq("group_id", groupId)
    .maybeSingle();

  if (error || !receipt) {
    if (error) console.error("Failed to fetch receipt for edit", error);
    return null;
  }

  const { data: confirmed } = await supabase.rpc("is_settlement_confirmed", {
    p_group_id: groupId,
    p_occurred_at: receipt.occurred_at,
  });

  const imageUrl = receipt.receipt_image_path
    ? await getReceiptImageSignedUrl(supabase, receipt.receipt_image_path)
    : null;

  const rawDetails = (receipt.receipt_details ??
    []) as unknown as RawEditDetail[];

  const items: ReceiptItem[] = rawDetails.map((d) => ({
    clientId: d.id,
    name: d.item_name,
    price: String(d.price),
    taxType: d.tax_type,
    taxRateId: d.tax_rate_id !== null ? String(d.tax_rate_id) : "",
    categoryId: String(d.category_id),
    purposeId: String(d.purpose_id),
    sceneIds: d.receipt_detail_scenes.map((s) => String(s.scene_id)),
    ownerUserId: d.owner_user_id ?? OWNER_JOINT_VALUE,
  }));

  const state: ReceiptFormState = {
    storeSelect:
      receipt.store_id !== null ? String(receipt.store_id) : SELECT_NONE_VALUE,
    storeInputText: receipt.store_id === null ? receipt.store_name : "",
    datetime: toDatetimeLocalValue(receipt.occurred_at),
    transactionTypeId: String(receipt.transaction_type_id),
    amount: String(receipt.amount),
    items,
  };

  return { state, receiptImageUrl: imageUrl, isLocked: Boolean(confirmed) };
}
