"use server";

import { auth } from "@/auth";
import { buildReceiptJson } from "@/lib/google/build-receipt-json";
import { uploadJsonToDrive } from "@/lib/google/drive-client";
import { validateReceiptForm } from "@/lib/validation/receipt-rules";
import type { ReceiptFormState } from "@/types/receipt";

export type SubmitReceiptResult =
  | { success: true }
  | { success: false; errors: string[] };

function toYYYYMMDDHHmm(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

export async function submitReceipt(
  state: ReceiptFormState
): Promise<SubmitReceiptResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, errors: ["ログインが必要です。"] };
  }

  const errors = validateReceiptForm(state);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  try {
    const now = new Date();
    const json = await buildReceiptJson(state, session.user.email ?? "", now);
    const filename = `receipt_${toYYYYMMDDHHmm(now)}.json`;
    await uploadJsonToDrive(session.user.id, filename, json);
    return { success: true };
  } catch (e) {
    console.error("Failed to upload receipt to Google Drive", e);
    const message =
      e instanceof Error ? e.message : "Google Drive へのアップロードに失敗しました。";
    return { success: false, errors: [message] };
  }
}
