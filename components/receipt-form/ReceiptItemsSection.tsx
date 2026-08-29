"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faLayerGroup } from "@fortawesome/free-solid-svg-icons";

import { Button } from "@/components/ui/Button";
import { ReceiptItemCard } from "@/components/receipt-form/ReceiptItemCard";
import { BulkInputModal } from "@/components/receipt-form/BulkInputModal";
import type { MasterData, ReceiptItem } from "@/types/receipt";

type ReceiptItemsSectionProps = {
  items: ReceiptItem[];
  amount: string;
  onAddItem: () => void;
  onRemoveItem: (clientId: string) => void;
  onUpdateItem: (clientId: string, patch: Partial<ReceiptItem>) => void;
  onBulkApply: (values: {
    taxRateId?: string;
    categoryId?: string;
    purposeId?: string;
  }) => void;
  masterData: Pick<
    MasterData,
    "consumptionTaxes" | "categories" | "purposes" | "scenes"
  >;
};

export function ReceiptItemsSection({
  items,
  amount,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onBulkApply,
  masterData,
}: ReceiptItemsSectionProps) {
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  // 一度に開けるのは1項目のみ（アコーディオン）。既定はすべて折りたたみ。
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          レシート項目
        </h2>
        {items.length > 1 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setBulkModalOpen(true)}
          >
            <FontAwesomeIcon icon={faLayerGroup} />
            一括入力
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {items.map((item, index) => (
          <ReceiptItemCard
            key={item.clientId}
            index={index}
            item={item}
            isOpen={openItemId === item.clientId}
            onToggleOpen={() =>
              setOpenItemId((prev) =>
                prev === item.clientId ? null : item.clientId
              )
            }
            amount={amount}
            showSameAsAmountButton={items.length === 1}
            showRemoveButton={items.length > 1}
            onChange={(patch) => onUpdateItem(item.clientId, patch)}
            onRemove={() => onRemoveItem(item.clientId)}
            masterData={masterData}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={onAddItem}
        className="mt-4 w-full justify-center"
      >
        <FontAwesomeIcon icon={faPlus} />
        項目を追加
      </Button>

      <BulkInputModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onApply={onBulkApply}
        masterData={masterData}
      />
    </section>
  );
}
