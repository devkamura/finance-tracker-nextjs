import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/AppHeader";
import { ReceiptForm } from "@/components/receipt-form/ReceiptForm";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [
    stores,
    transactionTypes,
    consumptionTaxes,
    categories,
    purposes,
    scenes,
  ] = await Promise.all([
    prisma.store.findMany({ orderBy: { id: "asc" } }),
    prisma.transactionType.findMany({ orderBy: { id: "asc" } }),
    prisma.consumptionTax.findMany({ orderBy: { id: "asc" } }),
    prisma.category.findMany({ orderBy: { id: "asc" } }),
    prisma.purpose.findMany({ orderBy: { id: "asc" } }),
    prisma.scene.findMany({ orderBy: { id: "asc" } }),
  ]);

  const defaultTransactionType =
    transactionTypes.find((t) => t.name === "支出") ?? transactionTypes[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <ReceiptForm
          masterData={{
            stores,
            transactionTypes,
            consumptionTaxes,
            categories,
            purposes,
            scenes,
          }}
          defaultTransactionTypeId={String(defaultTransactionType?.id ?? "")}
        />
      </main>
    </div>
  );
}
