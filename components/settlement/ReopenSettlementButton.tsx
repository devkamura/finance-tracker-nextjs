"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { reopenSettlement } from "@/lib/actions/reopen-settlement";

export function ReopenSettlementButton({
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
      const result = await reopenSettlement(new Date(periodMonth));
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
        再オープンは管理者のみ操作できます。
      </p>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full justify-center"
      >
        再オープンする
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="この月の精算を再オープンしますか？"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConfirm} disabled={isPending}>
              {isPending ? "処理中..." : "再オープンする"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          再オープンすると、この月のレシートを再び編集・削除・追加できるようになります。再度確定し直すまで、精算結果は「未確定」として表示されます。
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
