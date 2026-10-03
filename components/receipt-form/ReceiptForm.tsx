"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { ReceiptUnitSection } from "@/components/receipt-form/ReceiptUnitSection";
import { ReceiptItemsSection } from "@/components/receipt-form/ReceiptItemsSection";
import { OcrUploadSection } from "@/components/receipt-form/OcrUploadSection";
import type { BulkInputValues } from "@/components/receipt-form/BulkInputModal";
import { ConfirmSubmitModal } from "@/components/receipt-form/ConfirmSubmitModal";
import { SubmitLoadingOverlay } from "@/components/receipt-form/SubmitLoadingOverlay";
import { Toast, type ToastState } from "@/components/receipt-form/Toast";
import { createReceipt } from "@/lib/actions/create-receipt";
import { updateReceipt } from "@/lib/actions/update-receipt";
import { SELECT_NONE_VALUE } from "@/lib/constants";
import { autoBreakdownIdFor, breakdownIdAfterBulkApply } from "@/lib/receipts/breakdowns";
import { findPartner } from "@/lib/receipts/duplicate";
import {
  applyPayeeDefaults,
  EMPTY_PAYEE_DEFAULTS,
  isSelectablePayee,
} from "@/lib/receipts/payees";
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

// レシートの支払い月（"YYYY-MM"）を求める。datetime未入力時はlib/actions/create-receipt.ts
// のフォールバック（登録時刻）に合わせ、現在時刻の月を使う。
export function resolveOccurredMonth(datetime: string): string {
  if (/^\d{4}-\d{2}/.test(datetime)) {
    return datetime.slice(0, 7);
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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
    breakdownId: "",
    counterpartId: "",
    tagIds: [],
    // 帰属先は誤って共同のまま登録されることがないよう、既定は未選択にする。
    ownerUserId: "",
  };
}

// 推定税率(8/10)を、consumption_taxesマスタの該当するtaxRateIdへ変換する。
// 一致するマスタが無い場合は未選択のまま返す。
function resolveTaxRateId(
  taxRatePercent: number | null,
  consumptionTaxes: MasterData["consumptionTaxes"]
): string {
  if (taxRatePercent === null) return "";
  const matched = consumptionTaxes.find((t) => t.name === `${taxRatePercent}%`);
  return matched ? String(matched.id) : "";
}

// OCRで抽出した1商品をフォームのReceiptItemへ変換する。
// 税率(8%/10%)と税区分(税込/税別)は独立した判定であり、Geminiは商品名から
// 税率のみを推定する（税区分はOCRの仕組み上判定できないため判定させない。
// 手動入力側も同様に商品名だけでは税込/税別を判定できないため判定させない）。
// 価格はOCRが読み取った数値をそのまま使用し、税込換算等の計算は一切行わない。
// 税区分は既定で「税別」とし、税率が推定できた場合はその税率をあらかじめ
// 選択状態にしておく（推定できなかった場合は未選択のままとし、送信時の
// バリデーションでユーザーに手動選択を促す）。
export function buildOcrItem(
  item: OcrReceiptResult["items"][number],
  consumptionTaxes: MasterData["consumptionTaxes"]
): ReceiptItem {
  return {
    clientId: generateClientId(),
    name: item.name,
    price: String(item.price),
    taxType: "exclusive",
    taxRateId: resolveTaxRateId(item.taxRatePercent, consumptionTaxes),
    categoryId: "",
    breakdownId: "",
    counterpartId: "",
    tagIds: [],
    ownerUserId: "",
  };
}

// OCR読み取り結果を既存フォームの状態にマッピングする。
// カテゴリー・相手・帰属先はマスタ選択式でOCRからは判定できないため既定値のままとし、
// 支払い先名はプルダウンに出す支払い先（グループ全体・自分用）と名称が一致すれば
// プルダウン選択、一致しなければ手入力欄に反映する。
// OCRで支払い先が入った場合の既定値の自動入力は対象外（要件定義書 4.3節）。
function buildOcrPatch(
  result: OcrReceiptResult,
  payees: MasterData["payees"],
  consumptionTaxes: MasterData["consumptionTaxes"],
  currentUserId: string | undefined
): Partial<ReceiptFormState> {
  const patch: Partial<ReceiptFormState> = {};

  if (result.datetime) {
    patch.datetime = result.datetime;
  }
  if (result.totalPrice !== null) {
    patch.amount = String(result.totalPrice);
  }
  if (result.payeeName) {
    const matched = payees.find(
      (payee) => payee.name === result.payeeName && isSelectablePayee(payee, currentUserId)
    );
    if (matched) {
      patch.payeeSelect = String(matched.id);
      patch.payeeInputText = "";
    } else {
      patch.payeeSelect = SELECT_NONE_VALUE;
      patch.payeeInputText = result.payeeName;
    }
  }
  if (result.items.length > 0) {
    patch.items = result.items.map((item) =>
      buildOcrItem(item, consumptionTaxes)
    );
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
  // ログインユーザーのid。相方分の複製登録で「相方」を特定する（新規登録モードのみ）ほか、
  // 相手のプルダウンで自分を「自分（A）」と表示するために使う。
  currentUserId?: string;
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
  currentUserId,
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
  // 登録成功後、支払い月の一覧画面に移動して確認するか、続けて登録できるよう
  // 登録画面に留まるかの切り替え。連続登録を考慮し、送信のたびにはリセットしない。
  const [navigateAfterSubmit, setNavigateAfterSubmit] = useState(true);
  // 相方分も同じ内容で同時に登録するか（複製登録）。誤って二重登録しないよう、
  // 初期値はオフとし、登録のたびにオフへ戻す。
  const [duplicateForPartner, setDuplicateForPartner] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  const memberUserIds = masterData.members.map((m) => m.userId);
  // 相方（自分以外のグループメンバー）。いない場合は複製登録のチェックボックスを出さない。
  const partner =
    mode === "create" && currentUserId
      ? findPartner(masterData.members, currentUserId)
      : null;

  // 選択中の支払い先の既定値を明細に入れる（docs/分析拡充/基本設計書.md 3.4節）。
  // 「該当なし」・未選択は、既定値のない支払い先と同じ扱い（すべて未選択にする）。
  const withPayeeDefaults = (item: ReceiptItem, payeeSelect: string): ReceiptItem => {
    const payee = masterData.payees.find((p) => String(p.id) === payeeSelect);
    return applyPayeeDefaults(item, payee?.defaults ?? EMPTY_PAYEE_DEFAULTS, masterData);
  };

  // 支払い先の欄を変えたら、その既定値で全明細を上書きする（既定値のない項目は未選択にする。ユーザー確認済み）。
  // 編集画面を開いたときは保存済みの内容のまま（欄を変えたときだけ上書きする）。
  const updateState = (patch: Partial<ReceiptFormState>) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.payeeSelect !== undefined && patch.payeeSelect !== prev.payeeSelect) {
        next.items = next.items.map((item) => withPayeeDefaults(item, patch.payeeSelect!));
      }
      return next;
    });

  // 明細を追加したときも、選択中の支払い先の既定値を入れる
  const addItem = () =>
    setState((prev) => ({
      ...prev,
      items: [...prev.items, withPayeeDefaults(createEmptyItem(), prev.payeeSelect)],
    }));

  const removeItem = (clientId: string) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.clientId !== clientId),
    }));

  // カテゴリを変えたら内訳は選び直し。新しいカテゴリの内訳が1つだけなら自動で選ぶ
  // （docs/分析拡充/基本設計書.md 3.1節）。内訳を同時に指定した場合はその値を使う。
  const withBreakdownForCategory = (
    item: ReceiptItem,
    patch: Partial<ReceiptItem>
  ): Partial<ReceiptItem> =>
    patch.categoryId !== undefined &&
    patch.categoryId !== item.categoryId &&
    patch.breakdownId === undefined
      ? { ...patch, breakdownId: autoBreakdownIdFor(patch.categoryId, masterData.breakdowns) }
      : patch;

  const updateItem = (clientId: string, patch: Partial<ReceiptItem>) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.clientId === clientId
          ? { ...item, ...withBreakdownForCategory(item, patch) }
          : item
      ),
    }));

  const bulkApply = (values: BulkInputValues) =>
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
        breakdownId: breakdownIdAfterBulkApply(
          item.breakdownId,
          values.categoryId,
          values.breakdownId,
          masterData.breakdowns
        ),
        counterpartId: values.counterpartId ?? item.counterpartId,
        ownerUserId: values.ownerUserId ?? item.ownerUserId,
      })),
    }));

  const handleSubmitClick = () => {
    const result = validateReceiptForm(state, memberUserIds, masterData.breakdowns, {
      counterparts: masterData.counterparts,
      tags: masterData.tags,
    });
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
    // OCRの結果は既定値を入れずにそのまま反映する（updateStateを通さない）
    const patch = buildOcrPatch(
      result,
      masterData.payees,
      masterData.consumptionTaxes,
      currentUserId
    );
    setState((prev) => ({ ...prev, ...patch }));
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
      if (mode === "create" && partner && duplicateForPartner) {
        formData.set("duplicateForPartner", "true");
      }

      if (mode === "edit" && receiptId) {
        const result = await updateReceipt(receiptId, formData);
        if (result.success) {
          setToast({ type: "success", message: "レシートを更新しました。" });
          router.push(redirectHref ?? `/receipts/${receiptId}`);
          router.refresh();
          return;
        }
        setClientErrors(result.errors);
        setFieldErrors({ items: {} });
        setToast({ type: "error", message: "レシートの更新に失敗しました。" });
        return;
      }

      const result = await createReceipt(formData);
      if (result.success) {
        setDuplicateForPartner(false);
        if (navigateAfterSubmit) {
          const month = resolveOccurredMonth(state.datetime);
          router.push(`/receipts?month=${month}&open=${result.receiptId}`);
        } else {
          setToast({
            type: "success",
            message: formData.has("duplicateForPartner")
              ? `レシートを登録しました（${partner?.displayName}さんの分も登録済み）。`
              : "レシートを登録しました。",
          });
          setState(createInitialState(defaultTransactionTypeId));
          setImageFile(null);
          router.refresh();
        }
      } else {
        setClientErrors(result.errors);
        // サーバー側のエラーは項目単位に紐付かないため、赤枠表示はクリアする。
        setFieldErrors({ items: {} });
        setToast({ type: "error", message: "レシートの登録に失敗しました。" });
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
        currentUserId={currentUserId}
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
        currentUserId={currentUserId}
      />

      {partner && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <label className="flex items-center gap-2 text-sm font-medium text-orange-800">
            <input
              type="checkbox"
              checked={duplicateForPartner}
              onChange={(e) => setDuplicateForPartner(e.target.checked)}
              className="h-4 w-4 rounded border-orange-300"
            />
            相方（{partner.displayName}さん）の分も同じ内容で登録する
          </label>
          {/* 複製レシートでは明細の帰属先が変わるため、変換ルールをツールチップで示す
              （lib/receipts/duplicate.tsのbuildPartnerItemsと同じルール）。
              チェックボックスのlabel外に置き、アイコンのタップでチェックが切り替わらないようにする。 */}
          <Tooltip
            align="end"
            text={
              <>
                複製すると、相方分のレシートでは明細の帰属先が次のように変更されます。
                <span className="mt-1 block">・私 → {partner.displayName}さん</span>
                <span className="block">
                  ・{partner.displayName}さん → {partner.displayName}さん（変化なし）
                </span>
                <span className="block">・共同 → 共同（変化なし）</span>
              </>
            }
          />
        </div>
      )}

      {mode === "create" && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={navigateAfterSubmit}
            onChange={(e) => setNavigateAfterSubmit(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          登録後、支払い月の一覧画面に移動して確認する（オフの場合は続けて登録できます）
        </label>
      )}

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
        partnerDisplayName={
          partner && duplicateForPartner ? partner.displayName : null
        }
      />
    </div>
  );
}
