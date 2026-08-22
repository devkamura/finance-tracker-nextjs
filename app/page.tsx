import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { ReceiptForm } from "@/components/receipt-form/ReceiptForm";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [
    { data: stores, error: storesError },
    { data: transactionTypes, error: transactionTypesError },
    { data: consumptionTaxes, error: consumptionTaxesError },
    { data: categories, error: categoriesError },
    { data: purposes, error: purposesError },
    { data: scenes, error: scenesError },
  ] = await Promise.all([
    supabase.from("stores").select("id, name").order("id"),
    supabase.from("transaction_types").select("id, name").order("id"),
    supabase.from("consumption_taxes").select("id, name").order("id"),
    supabase.from("categories").select("id, name").order("id"),
    supabase.from("purposes").select("id, name").order("id"),
    supabase.from("scenes").select("id, name").order("id"),
  ]);

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

  const defaultTransactionType =
    transactionTypes!.find((t) => t.name === "支出") ?? transactionTypes![0];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <ReceiptForm
          masterData={{
            stores: stores!,
            transactionTypes: transactionTypes!,
            consumptionTaxes: consumptionTaxes!,
            categories: categories!,
            purposes: purposes!,
            scenes: scenes!,
          }}
          defaultTransactionTypeId={String(defaultTransactionType?.id ?? "")}
        />
      </main>
    </div>
  );
}
