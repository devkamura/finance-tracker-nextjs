"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { visibleBreakdownsFor } from "@/lib/receipts/breakdowns";
import { counterpartOptionLabel } from "@/lib/receipts/labels";
import type { MasterData } from "@/types/receipt";

// 一括入力で全項目に適用する値（undefined の項目は変更しない）
export type BulkInputValues = {
  taxType?: "inclusive" | "exclusive";
  taxRateId?: string;
  categoryId?: string;
  // カテゴリと一緒にだけ指定できる。カテゴリだけを指定した場合は、各項目で内訳を選び直す
  // （内訳が1つだけのカテゴリは自動で選ばれる）
  breakdownId?: string;
  counterpartId?: string;
  ownerUserId?: string;
};

type BulkInputModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (values: BulkInputValues) => void;
  masterData: Pick<
    MasterData,
    "consumptionTaxes" | "categories" | "breakdowns" | "counterparts" | "members"
  >;
  currentUserId?: string;
};

const NOT_CHANGED = "";

export function BulkInputModal({
  open,
  onClose,
  onApply,
  masterData,
  currentUserId,
}: BulkInputModalProps) {
  const [taxType, setTaxType] = useState(NOT_CHANGED);
  const [taxRateId, setTaxRateId] = useState(NOT_CHANGED);
  const [categoryId, setCategoryId] = useState(NOT_CHANGED);
  const [breakdownId, setBreakdownId] = useState(NOT_CHANGED);
  const [counterpartId, setCounterpartId] = useState(NOT_CHANGED);
  const [ownerUserId, setOwnerUserId] = useState(NOT_CHANGED);

  const reset = () => {
    setTaxType(NOT_CHANGED);
    setTaxRateId(NOT_CHANGED);
    setCategoryId(NOT_CHANGED);
    setBreakdownId(NOT_CHANGED);
    setCounterpartId(NOT_CHANGED);
    setOwnerUserId(NOT_CHANGED);
  };

  const handleApply = () => {
    onApply({
      taxType: (taxType || undefined) as "inclusive" | "exclusive" | undefined,
      taxRateId: taxRateId || undefined,
      categoryId: categoryId || undefined,
      breakdownId: categoryId && breakdownId ? breakdownId : undefined,
      counterpartId: counterpartId || undefined,
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
          onChange={(e) => {
            setCategoryId(e.target.value);
            // カテゴリを変えたら内訳は選び直す
            setBreakdownId(NOT_CHANGED);
          }}
        >
          <option value={NOT_CHANGED}>変更しない</option>
          {masterData.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {categoryId && visibleBreakdownsFor(categoryId, masterData.breakdowns).length > 0 && (
          <Select
            label="内訳"
            value={breakdownId}
            onChange={(e) => setBreakdownId(e.target.value)}
          >
            <option value={NOT_CHANGED}>各項目で選ぶ</option>
            {visibleBreakdownsFor(categoryId, masterData.breakdowns).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="相手"
          value={counterpartId}
          onChange={(e) => setCounterpartId(e.target.value)}
        >
          <option value={NOT_CHANGED}>変更しない</option>
          {masterData.counterparts
            .filter((c) => !c.isHidden)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {counterpartOptionLabel(c, currentUserId)}
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
