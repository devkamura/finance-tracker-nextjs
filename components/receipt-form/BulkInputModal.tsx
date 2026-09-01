"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import type { MasterData } from "@/types/receipt";

type BulkValues = {
  taxType?: "inclusive" | "exclusive";
  taxRateId?: string;
  categoryId?: string;
  purposeId?: string;
  ownerUserId?: string;
};

type BulkInputModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (values: BulkValues) => void;
  masterData: Pick<
    MasterData,
    "consumptionTaxes" | "categories" | "purposes" | "members"
  >;
};

const NOT_CHANGED = "";

export function BulkInputModal({
  open,
  onClose,
  onApply,
  masterData,
}: BulkInputModalProps) {
  const [taxType, setTaxType] = useState(NOT_CHANGED);
  const [taxRateId, setTaxRateId] = useState(NOT_CHANGED);
  const [categoryId, setCategoryId] = useState(NOT_CHANGED);
  const [purposeId, setPurposeId] = useState(NOT_CHANGED);
  const [ownerUserId, setOwnerUserId] = useState(NOT_CHANGED);

  const reset = () => {
    setTaxType(NOT_CHANGED);
    setTaxRateId(NOT_CHANGED);
    setCategoryId(NOT_CHANGED);
    setPurposeId(NOT_CHANGED);
    setOwnerUserId(NOT_CHANGED);
  };

  const handleApply = () => {
    onApply({
      taxType: (taxType || undefined) as "inclusive" | "exclusive" | undefined,
      taxRateId: taxRateId || undefined,
      categoryId: categoryId || undefined,
      purposeId: purposeId || undefined,
      ownerUserId: ownerUserId || undefined,
    });
    reset();
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
          label="税区分"
          value={taxType}
          onChange={(e) => {
            setTaxType(e.target.value);
            if (e.target.value !== "exclusive") {
              setTaxRateId(NOT_CHANGED);
            }
          }}
        >
          <option value={NOT_CHANGED}>変更しない</option>
          <option value="inclusive">税込</option>
          <option value="exclusive">税別</option>
        </Select>
        {taxType === "exclusive" && (
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
        )}
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
        <Select
          label="帰属先"
          value={ownerUserId}
          onChange={(e) => setOwnerUserId(e.target.value)}
        >
          <option value={NOT_CHANGED}>変更しない</option>
          <option value={OWNER_JOINT_VALUE}>共同</option>
          {masterData.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </div>
    </Modal>
  );
}
