"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { ReceiptUnitSection } from "@/components/receipt-form/ReceiptUnitSection";
import { ReceiptItemsSection } from "@/components/receipt-form/ReceiptItemsSection";
import { ConfirmSubmitModal } from "@/components/receipt-form/ConfirmSubmitModal";
import { SubmitLoadingOverlay } from "@/components/receipt-form/SubmitLoadingOverlay";
import { Toast, type ToastState } from "@/components/receipt-form/Toast";
import { submitReceipt } from "@/lib/actions/submit-receipt";
import { validateReceiptForm } from "@/lib/validation/receipt-rules";
import type { MasterData, ReceiptFormState, ReceiptItem } from "@/types/receipt";

function createEmptyItem(): ReceiptItem {
  return {
    clientId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `item-${Date.now()}-${Math.random()}`,
    name: "",
    price: "",
    taxRateId: "",
    categoryId: "",
    purposeId: "",
    sceneIds: [],
  };
}

function createInitialState(defaultTransactionTypeId: string): ReceiptFormState {
  return {
    storeSelect: "",
    storeInputText: "",
    datetime: "",
    transactionTypeId: defaultTransactionTypeId,
    amount: "",
    items: [createEmptyItem()],
  };
}

type ReceiptFormProps = {
  masterData: MasterData;
  defaultTransactionTypeId: string;
};

export function ReceiptForm({
  masterData,
  defaultTransactionTypeId,
}: ReceiptFormProps) {
  const [state, setState] = useState<ReceiptFormState>(() =>
    createInitialState(defaultTransactionTypeId)
  );
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  const updateState = (patch: Partial<ReceiptFormState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  const addItem = () =>
    setState((prev) => ({ ...prev, items: [...prev.items, createEmptyItem()] }));

  const removeItem = (clientId: string) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.clientId !== clientId),
    }));

  const updateItem = (clientId: string, patch: Partial<ReceiptItem>) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.clientId === clientId ? { ...item, ...patch } : item
      ),
    }));

  const bulkApply = (values: {
    taxRateId?: string;
    categoryId?: string;
    purposeId?: string;
  }) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => ({
        ...item,
        taxRateId: values.taxRateId ?? item.taxRateId,
        categoryId: values.categoryId ?? item.categoryId,
        purposeId: values.purposeId ?? item.purposeId,
      })),
    }));

  const handleSubmitClick = () => {
    const errors = validateReceiptForm(state);
    if (errors.length > 0) {
      setClientErrors(errors);
      return;
    }
    setClientErrors([]);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await submitReceipt(state);
      if (result.success) {
        setToast({
          type: "success",
          message: "Google Drive へのアップロードに成功しました。",
        });
        setState(createInitialState(defaultTransactionTypeId));
      } else {
        setClientErrors(result.errors);
        setToast({
          type: "error",
          message: "Google Drive へのアップロードに失敗しました。",
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <SubmitLoadingOverlay show={isPending} />

      {clientErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <ul className="list-inside list-disc">
            {clientErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <ReceiptUnitSection
        state={state}
        onChange={updateState}
        masterData={masterData}
      />

      <ReceiptItemsSection
        items={state.items}
        amount={state.amount}
        onAddItem={addItem}
        onRemoveItem={removeItem}
        onUpdateItem={updateItem}
        onBulkApply={bulkApply}
        masterData={masterData}
      />

      <Button
        type="button"
        onClick={handleSubmitClick}
        disabled={isPending}
        className="w-full justify-center py-3 text-base"
      >
        Google Drive へ送信
      </Button>

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
