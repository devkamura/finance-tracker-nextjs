"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ConfirmSubmitModalProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  // 合計金額と明細合計が一致しない場合にtrue。保存自体はブロックせず警告のみ表示する
  // （要件定義書21〜22章：ポイント・クーポン等による不一致は正常な状態として許容する）。
  amountMismatch?: boolean;
};

export function ConfirmSubmitModal({
  open,
  onCancel,
  onConfirm,
  amountMismatch = false,
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
      {amountMismatch && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
          金額が一致していません。誤りがないか確認してください。
        </p>
      )}
      <p className="text-sm text-slate-600">
        この内容でレシートを登録します。よろしいですか？
      </p>
    </Modal>
  );
}
