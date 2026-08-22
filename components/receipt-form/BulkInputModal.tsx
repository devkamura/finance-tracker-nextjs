"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import type { MasterData } from "@/types/receipt";

type BulkValues = {
  taxRateId?: string;
  categoryId?: string;
  purposeId?: string;
};

type BulkInputModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (values: BulkValues) => void;
  masterData: Pick<MasterData, "consumptionTaxes" | "categories" | "purposes">;
};

const NOT_CHANGED = "";

export function BulkInputModal({
  open,
  onClose,
  onApply,
  masterData,
}: BulkInputModalProps) {
  const [taxRateId, setTaxRateId] = useState(NOT_CHANGED);
  const [categoryId, setCategoryId] = useState(NOT_CHANGED);
  const [purposeId, setPurposeId] = useState(NOT_CHANGED);

  const handleApply = () => {
    onApply({
      taxRateId: taxRateId || undefined,
      categoryId: categoryId || undefined,
      purposeId: purposeId || undefined,
    });
    setTaxRateId(NOT_CHANGED);
    setCategoryId(NOT_CHANGED);
    setPurposeId(NOT_CHANGED);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="一括入力"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleApply}>
            全項目に適用
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select
          label="税率"
          value={taxRateId}
          onChange={(e) => setTaxRateId(e.target.value)}
        >
          <option value={NOT_CHANGED}>変更しない</option>
          {masterData.consumptionTaxes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select
          label="カテゴリー"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value={NOT_CHANGED}>変更しない</option>
          {masterData.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="目的"
          value={purposeId}
          onChange={(e) => setPurposeId(e.target.value)}
        >
          <option value={NOT_CHANGED}>変更しない</option>
          {masterData.purposes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
    </Modal>
  );
}
