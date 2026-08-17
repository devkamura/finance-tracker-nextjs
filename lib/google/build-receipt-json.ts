import { prisma } from "@/lib/prisma";
import { SELECT_NONE_VALUE } from "@/lib/constants";
import type { ReceiptFormState } from "@/types/receipt";

function toYYYYMMDDHHmm(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function formatDatetime(input: string, now: Date): string {
  if (!input) return toYYYYMMDDHHmm(now);
  // "2026-08-17T14:53" -> "202608171453"
  return input.replace(/[-T:]/g, "");
}

async function resolveStoreName(
  storeSelect: string,
  storeInputText: string
): Promise<string> {
  if (!storeSelect) return "";
  if (storeSelect === SELECT_NONE_VALUE) return storeInputText;

  const store = await prisma.store.findUniqueOrThrow({
    where: { id: Number(storeSelect) },
  });
  return store.name;
}

export async function buildReceiptJson(
  state: ReceiptFormState,
  userEmail: string,
  now: Date
) {
  const [location, transactionType] = await Promise.all([
    resolveStoreName(state.storeSelect, state.storeInputText),
    prisma.transactionType.findUniqueOrThrow({
      where: { id: Number(state.transactionTypeId) },
    }),
  ]);

  const items = await Promise.all(
    state.items.map(async (item) => {
      const [tax, category, purpose, scenes] = await Promise.all([
        prisma.consumptionTax.findUniqueOrThrow({
          where: { id: Number(item.taxRateId) },
        }),
        prisma.category.findUniqueOrThrow({
          where: { id: Number(item.categoryId) },
        }),
        prisma.purpose.findUniqueOrThrow({
          where: { id: Number(item.purposeId) },
        }),
        prisma.scene.findMany({
          where: { id: { in: item.sceneIds.map(Number) } },
        }),
      ]);

      return {
        price: Number(item.price),
        tax_rate: tax.name,
        category: category.name,
        purpose: purpose.name,
        scene: scenes.map((s) => s.name),
        memo: item.name,
      };
    })
  );

  return {
    user: userEmail,
    // OCR機能は未実装のため、読み取り原文は常に空文字列を出力する。
    text: "",
    location,
    datetime: formatDatetime(state.datetime, now),
    expense_or_refund: transactionType.name,
    total_price: Number(state.amount),
    items,
  };
}
