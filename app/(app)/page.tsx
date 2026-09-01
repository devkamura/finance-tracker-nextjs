import { ReceiptForm } from "@/components/receipt-form/ReceiptForm";
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
    { data: payees, error: payeesError },
    { data: transactionTypes, error: transactionTypesError },
    { data: consumptionTaxes, error: consumptionTaxesError },
    { data: categories, error: categoriesError },
    { data: purposes, error: purposesError },
    { data: scenes, error: scenesError },
    members,
  ] = await Promise.all([
    supabase.from("payees").select("id, name").order("id"),
    supabase.from("transaction_types").select("id, name").order("id"),
    supabase.from("consumption_taxes").select("id, name").order("id"),
    supabase.from("categories").select("id, name").order("id"),
    supabase.from("purposes").select("id, name").order("id"),
    supabase.from("scenes").select("id, name").order("id"),
    getGroupMembers(supabase, membership!.groupId),
  ]);

  const error =
    payeesError ||
    transactionTypesError ||
    consumptionTaxesError ||
    categoriesError ||
    purposesError ||
    scenesError;
  if (error) {
    throw error;
  }

  const defaultTransactionType =
    transactionTypes!.find((t) => t.name === "支出") ?? transactionTypes![0];

  return (
    <ReceiptForm
      masterData={{
        payees: payees!,
        transactionTypes: transactionTypes!,
        consumptionTaxes: consumptionTaxes!,
        categories: categories!,
        purposes: purposes!,
        scenes: scenes!,
        members,
      }}
      defaultTransactionTypeId={String(defaultTransactionType?.id ?? "")}
    />
  );
}
