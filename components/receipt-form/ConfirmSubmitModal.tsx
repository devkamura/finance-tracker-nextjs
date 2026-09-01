"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ConfirmSubmitModalProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmSubmitModal({
  open,
  onCancel,
  onConfirm,
}: ConfirmSubmitModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="内容を確認しましたか？"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            戻る
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            送信する
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        この内容でレシートを登録します。よろしいですか？
      </p>
    </Modal>
  );
}
