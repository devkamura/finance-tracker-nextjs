import Link from "next/link";
import { notFound } from "next/navigation";

import { ReceiptForm } from "@/components/receipt-form/ReceiptForm";
import { getReceiptForEdit } from "@/lib/receipts/queries";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export default async function ReceiptEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; sort?: string }>;
}) {
  const { id } = await params;
  const { month, sort } = await searchParams;
  const detailParams = new URLSearchParams();
  if (month) detailParams.set("month", month);
  if (sort) detailParams.set("sort", sort);
  const detailHref = `/receipts/${id}${detailParams.toString() ? `?${detailParams.toString()}` : ""}`;

  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const [editData, members, masters] = await Promise.all([
    getReceiptForEdit(supabase, membership!.groupId, id),
    getGroupMembers(supabase, membership!.groupId),
    Promise.all([
      supabase.from("stores").select("id, name").order("id"),
      supabase.from("transaction_types").select("id, name").order("id"),
      supabase.from("consumption_taxes").select("id, name").order("id"),
      supabase.from("categories").select("id, name").order("id"),
      supabase.from("purposes").select("id, name").order("id"),
      supabase.from("scenes").select("id, name").order("id"),
    ]),
  ]);

  if (!editData) {
    notFound();
  }

  const [
    { data: stores, error: storesError },
    { data: transactionTypes, error: transactionTypesError },
    { data: consumptionTaxes, error: consumptionTaxesError },
    { data: categories, error: categoriesError },
    { data: purposes, error: purposesError },
    { data: scenes, error: scenesError },
  ] = masters;

  const error =
    storesError ||
    transactionTypesError ||
    consumptionTaxesError ||
    categoriesError ||
    purposesError ||
    scenesError;
  if (error) {
    throw error;
  }

  if (editData.isLocked) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href={detailHref}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← レシート詳細に戻る
        </Link>
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          この月の精算は確定済みのため編集できません。管理者に再オープンを依頼してください。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={detailHref}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← レシート詳細に戻る
      </Link>
      <h1 className="text-xl font-bold text-slate-900">レシートを編集</h1>
      <ReceiptForm
        mode="edit"
        receiptId={id}
        initialState={editData.state}
        initialImageUrl={editData.receiptImageUrl}
        redirectHref={detailHref}
        masterData={{
          stores: stores!,
          transactionTypes: transactionTypes!,
          consumptionTaxes: consumptionTaxes!,
          categories: categories!,
          purposes: purposes!,
          scenes: scenes!,
          members,
        }}
        defaultTransactionTypeId={editData.state.transactionTypeId}
      />
    </div>
  );
}
