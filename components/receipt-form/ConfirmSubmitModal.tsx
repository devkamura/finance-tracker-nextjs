"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ConfirmSubmitModalProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  // 相方分の複製登録を行う場合の相方の表示名。nullなら通常の1件登録。
  partnerDisplayName?: string | null;
};

export function ConfirmSubmitModal({
  open,
  onCancel,
  onConfirm,
  partnerDisplayName = null,
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
      {partnerDisplayName ? (
        <p className="text-sm text-slate-600">
          相方（
          <span className="font-semibold text-orange-700">
            {partnerDisplayName}さん
          </span>
          ）の分も含め
          <span className="font-semibold text-orange-700">2件</span>
          登録します。よろしいですか？
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          この内容でレシートを登録します。よろしいですか？
        </p>
      )}
    </Modal>
  );
}
