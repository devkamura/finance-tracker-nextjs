import { ReceiptForm } from "@/components/receipt-form/ReceiptForm";
import {
  getCategoryBreakdowns,
  getCounterparts,
  getPayees,
  getTags,
} from "@/lib/settings/queries";
import { getCurrentMembership, getGroupMembers } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  // ログイン必須・グループ所属必須はapp/(app)/layout.tsxで既に保証されている。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const [
    payees,
    { data: transactionTypes, error: transactionTypesError },
    { data: consumptionTaxes, error: consumptionTaxesError },
    { data: categories, error: categoriesError },
    members,
    breakdowns,
    tags,
  ] = await Promise.all([
    getPayees(supabase, membership!.groupId),
    supabase.from("transaction_types").select("id, name").order("id"),
    supabase.from("consumption_taxes").select("id, name, multiplier").order("id"),
    supabase.from("categories").select("id, name").order("id"),
    getGroupMembers(supabase, membership!.groupId),
    getCategoryBreakdowns(supabase, membership!.groupId),
    getTags(supabase, membership!.groupId),
  ]);
  // メンバーの相手の名前はメンバーの表示名を使うため、メンバーの取得後に取得する
  const counterparts = await getCounterparts(supabase, membership!.groupId, members);

  const error =
    transactionTypesError ||
    consumptionTaxesError ||
    categoriesError;
  if (error) {
    throw error;
  }

  const defaultTransactionType =
    transactionTypes!.find((t) => t.name === "支出") ?? transactionTypes![0];

  return (
    <ReceiptForm
      masterData={{
        payees,
        transactionTypes: transactionTypes!,
        consumptionTaxes: consumptionTaxes!,
        categories: categories!,
        breakdowns,
        counterparts,
        tags,
        members,
      }}
      defaultTransactionTypeId={String(defaultTransactionType?.id ?? "")}
      currentUserId={user!.id}
    />
  );
}
