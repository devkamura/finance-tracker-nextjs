"use client";

import { useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { estimateReceiptItemTaxRates } from "@/lib/actions/estimate-tax-rates";
import type { MasterData, ReceiptItem } from "@/types/receipt";

type EstimateTaxRateButtonProps = {
  items: ReceiptItem[];
  onUpdateItem: (clientId: string, patch: Partial<ReceiptItem>) => void;
  onError: (message: string) => void;
  consumptionTaxes: MasterData["consumptionTaxes"];
};

// 手動入力の明細に対し、商品名からGeminiで消費税率(8%/10%)を推定し、
// 各項目の「税率」欄へ反映する。税率と税区分(税込/税別)は独立した判定であり、
// 商品名だけでは税込/税別を判定できないため、税区分・価格は一切変更しない
// （税区分が不明な場合は既存の値を保持する）。
// OCR読み取り時は抽出と同時に推定されるため、このボタンは主に手動追加した
// 項目や、OCR後に商品名を修正した項目向けに使う。
export function EstimateTaxRateButton({
  items,
  onUpdateItem,
  onError,
  consumptionTaxes,
}: EstimateTaxRateButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const targetItems = items.filter((item) => item.name.trim() !== "");

  const handleConfirm = () => {
    setConfirmOpen(false);

    startTransition(async () => {
      const result = await estimateReceiptItemTaxRates(
        targetItems.map((item) => item.name)
      );
      if (!result.success) {
        onError(result.error);
        return;
      }
      result.data.forEach((taxRatePercent, index) => {
        if (taxRatePercent === null) return;
        const matched = consumptionTaxes.find(
          (t) => t.name === `${taxRatePercent}%`
        );
        if (!matched) return;
        onUpdateItem(targetItems[index].clientId, {
          taxRateId: String(matched.id),
        });
      });
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending || targetItems.length === 0}
      >
        <FontAwesomeIcon icon={faWandMagicSparkles} />
        {isPending ? "推定中..." : "税率を自動推定"}
      </Button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="税率を推定しますか？"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConfirm}>推定する</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Gemini APIを使用して、商品名から各項目の税率（8%・10%）を推定し「税率」欄へ反映します。税込/税別の選択・価格は変更しません。APIの利用回数がかかるため、内容を確認してから実行してください。推定結果は必ず確認し、必要に応じて修正してください。
        </p>
      </Modal>
    </>
  );
}
