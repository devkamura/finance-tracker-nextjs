"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { ReceiptUnitSection } from "@/components/receipt-form/ReceiptUnitSection";
import { ReceiptItemsSection } from "@/components/receipt-form/ReceiptItemsSection";
import { OcrUploadSection } from "@/components/receipt-form/OcrUploadSection";
import { ConfirmSubmitModal } from "@/components/receipt-form/ConfirmSubmitModal";
import { SubmitLoadingOverlay } from "@/components/receipt-form/SubmitLoadingOverlay";
import { Toast, type ToastState } from "@/components/receipt-form/Toast";
import { createReceipt } from "@/lib/actions/create-receipt";
import { updateReceipt } from "@/lib/actions/update-receipt";
import { SELECT_NONE_VALUE } from "@/lib/constants";
import {
  validateReceiptForm,
  type ReceiptFormFieldErrors,
} from "@/lib/validation/receipt-rules";
import type {
  MasterData,
  OcrReceiptResult,
  ReceiptFormState,
  ReceiptItem,
} from "@/types/receipt";

function generateClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random()}`;
}

function createEmptyItem(): ReceiptItem {
  return {
    clientId: generateClientId(),
    name: "",
    price: "",
    taxType: "inclusive",
    taxRateId: "",
    categoryId: "",
    purposeId: "",
    sceneIds: [],
    // 帰属先は誤って共同のまま登録されることがないよう、既定は未選択にする。
    ownerUserId: "",
  };
}

// OCR読み取り結果を既存フォームの状態にマッピングする。
// 税区分・税率・カテゴリー・目的・帰属先はマスタ選択式でOCRからは判定できないため
// 既定値のままとし、支払い先名は登録済みマスタと名称が一致すればプルダウン選択、
// 一致しなければ手入力欄に反映する。
function buildOcrPatch(
  result: OcrReceiptResult,
  payees: MasterData["payees"]
): Partial<ReceiptFormState> {
  const patch: Partial<ReceiptFormState> = {};

  if (result.datetime) {
    patch.datetime = result.datetime;
  }
  if (result.totalPrice !== null) {
    patch.amount = String(result.totalPrice);
  }
  if (result.payeeName) {
    const matched = payees.find((payee) => payee.name === result.payeeName);
    if (matched) {
      patch.payeeSelect = String(matched.id);
      patch.payeeInputText = "";
    } else {
      patch.payeeSelect = SELECT_NONE_VALUE;
      patch.payeeInputText = result.payeeName;
    }
  }
  if (result.items.length > 0) {
    patch.items = result.items.map((item) => ({
      clientId: generateClientId(),
      name: item.name,
      price: String(item.price),
      taxType: "inclusive",
      taxRateId: "",
      categoryId: "",
      purposeId: "",
      sceneIds: [],
      ownerUserId: "",
    }));
  }

  return patch;
}

function createInitialState(defaultTransactionTypeId: string): ReceiptFormState {
  return {
    payeeSelect: "",
    payeeInputText: "",
    datetime: "",
    transactionTypeId: defaultTransactionTypeId,
    amount: "",
    // 新規登録時は常に登録者本人がサーバー側で自動設定されるため未使用。
    payerUserId: "",
    items: [createEmptyItem()],
  };
}

type ReceiptFormProps = {
  masterData: MasterData;
  defaultTransactionTypeId: string;
  // 編集モード（既存レシートの更新）用の追加props。省略時は新規登録モードとして動作する。
  mode?: "create" | "edit";
  receiptId?: string;
  initialState?: ReceiptFormState;
  initialImageUrl?: string | null;
  // 編集成功後の遷移先（一覧から開いていた月・並び順付きの詳細URLなど）。
  // 省略時は/receipts/{receiptId}へ遷移する。
  redirectHref?: string;
};

export function ReceiptForm({
  masterData,
  defaultTransactionTypeId,
  mode = "create",
  receiptId,
  initialState,
  initialImageUrl = null,
  redirectHref,
}: ReceiptFormProps) {
  const router = useRouter();
  const [state, setState] = useState<ReceiptFormState>(
    () => initialState ?? createInitialState(defaultTransactionTypeId)
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<ReceiptFormFieldErrors>({
    items: {},
  });
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  const memberUserIds = masterData.members.map((m) => m.userId);

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
    taxType?: "inclusive" | "exclusive";
    taxRateId?: string;
    categoryId?: string;
    purposeId?: string;
    ownerUserId?: string;
  }) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => ({
        ...item,
        taxType: values.taxType ?? item.taxType,
        taxRateId:
          values.taxType === "inclusive"
            ? ""
            : (values.taxRateId ?? item.taxRateId),
        categoryId: values.categoryId ?? item.categoryId,
        purposeId: values.purposeId ?? item.purposeId,
        ownerUserId: values.ownerUserId ?? item.ownerUserId,
      })),
    }));

  const handleSubmitClick = () => {
    const result = validateReceiptForm(state, memberUserIds);
    if (result.errors.length > 0) {
      setClientErrors(result.errors);
      setFieldErrors(result.fieldErrors);
      // エラーのある最初の項目を自動的に開いて赤枠が見えるようにする。
      const firstErroredItemId = Object.keys(result.fieldErrors.items)[0];
      if (firstErroredItemId && !result.fieldErrors.items[openItemId ?? ""]) {
        setOpenItemId(firstErroredItemId);
      }
      return;
    }
    setClientErrors([]);
    setFieldErrors({ items: {} });
    setConfirmOpen(true);
  };

  const handleOcrExtracted = (result: OcrReceiptResult) => {
    updateState(buildOcrPatch(result, masterData.payees));
    setToast({
      type: "success",
      message: "レシートを読み取りました。内容を確認してください。",
    });
  };

  const handleOcrError = (message: string) => {
    setToast({ type: "error", message });
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("state", JSON.stringify(state));
      if (imageFile) {
        formData.set("image", imageFile);
      }

      const result =
        mode === "edit" && receiptId
          ? await updateReceipt(receiptId, formData)
          : await createReceipt(formData);

      if (result.success) {
        if (mode === "edit" && receiptId) {
          setToast({ type: "success", message: "レシートを更新しました。" });
          router.push(redirectHref ?? `/receipts/${receiptId}`);
          router.refresh();
        } else {
          setToast({ type: "success", message: "レシートを登録しました。" });
          setState(createInitialState(defaultTransactionTypeId));
          setImageFile(null);
          router.refresh();
        }
      } else {
        setClientErrors(result.errors);
        // サーバー側のエラーは項目単位に紐付かないため、赤枠表示はクリアする。
        setFieldErrors({ items: {} });
        setToast({
          type: "error",
          message:
            mode === "edit"
              ? "レシートの更新に失敗しました。"
              : "レシートの登録に失敗しました。",
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

      {mode === "edit" && initialImageUrl && !imageFile && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">
            現在のレシート画像
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={initialImageUrl}
            alt="現在のレシート画像"
            className="mt-3 max-h-64 rounded-lg border border-slate-200 object-contain"
          />
          <p className="mt-2 text-xs text-slate-500">
            新しい画像を選択すると差し替わります。
          </p>
        </div>
      )}

      <OcrUploadSection
        file={imageFile}
        onFileChange={setImageFile}
        onExtracted={handleOcrExtracted}
        onError={handleOcrError}
      />

      <ReceiptUnitSection
        state={state}
        onChange={updateState}
        masterData={masterData}
        fieldErrors={fieldErrors}
        showPayerSelect={mode === "edit"}
      />

      <ReceiptItemsSection
        items={state.items}
        amount={state.amount}
        onAddItem={addItem}
        onRemoveItem={removeItem}
        onUpdateItem={updateItem}
        onBulkApply={bulkApply}
        fieldErrors={fieldErrors.items}
        openItemId={openItemId}
        onOpenItemChange={setOpenItemId}
        masterData={masterData}
      />

      <Button
        type="button"
        onClick={handleSubmitClick}
        disabled={isPending}
        className="w-full justify-center py-3 text-base"
      >
        {mode === "edit" ? "更新する" : "登録する"}
      </Button>

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
