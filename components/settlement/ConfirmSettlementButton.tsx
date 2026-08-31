"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { confirmSettlement } from "@/lib/actions/confirm-settlement";

export function ConfirmSettlementButton({
  periodMonth,
  isAdmin,
}: {
  periodMonth: string; // "YYYY-MM-01"
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await confirmSettlement(new Date(periodMonth));
      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  if (!isAdmin) {
    return (
      <p className="text-center text-xs text-slate-400">
        精算の確定は管理者のみ操作できます。
      </p>
    );
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="w-full justify-center">
        この月の精算を確定する
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="この月の精算を確定しますか？"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConfirm} disabled={isPending}>
              {isPending ? "確定中..." : "確定する"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          確定すると、この月のレシートは編集・削除できなくなります。管理者のみ再オープンできます。
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
