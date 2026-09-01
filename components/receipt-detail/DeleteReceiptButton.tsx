"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { deleteReceipt } from "@/lib/actions/delete-receipt";

type DeleteReceiptButtonProps = {
  receiptId: string;
  disabled?: boolean;
  // 削除後に戻る一覧のURL（月・並び順を維持する）。省略時は/receipts。
  backHref?: string;
};

export function DeleteReceiptButton({
  receiptId,
  disabled,
  backHref = "/receipts",
}: DeleteReceiptButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deleteReceipt(receiptId);
      if (result.success) {
        setOpen(false);
        router.push(backHref);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="danger"
        className="flex-1 justify-center"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        削除する
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="レシートを削除しますか？"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "削除中..." : "削除する"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          この操作は取り消せません。レシートと明細、保存されている画像もあわせて削除されます。
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
