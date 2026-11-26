"use client";

import { Select } from "@/components/ui/Select";
import { SELECT_NONE_VALUE } from "@/lib/constants";
import { findPayeeByName, payeeOptionLabel, payeeOptions } from "@/lib/receipts/payees";
import type { ReceiptFormFieldErrors } from "@/lib/validation/receipt-rules";
import type { MasterData, ReceiptFormState } from "@/types/receipt";

type ReceiptUnitSectionProps = {
  state: ReceiptFormState;
  onChange: (patch: Partial<ReceiptFormState>) => void;
  masterData: Pick<MasterData, "payees" | "transactionTypes" | "members">;
  fieldErrors?: Pick<ReceiptFormFieldErrors, "transactionTypeId" | "amount">;
  // 支払者選択は編集画面でのみ表示する（新規登録は常に登録者本人に自動設定されるため）。
  showPayerSelect?: boolean;
  // ログインユーザーのid。支払い先のプルダウンに自分用の支払い先を出すために使う。
  currentUserId?: string;
};

export function ReceiptUnitSection({
  state,
  onChange,
  masterData,
  fieldErrors,
  showPayerSelect = false,
  currentUserId,
}: ReceiptUnitSectionProps) {
  // 自分が非表示にしていない支払い先を出す。非表示の支払い先は、
  // 編集中のレシートで選ばれているときだけ残す（docs/requirements.md「支払い先の一本化」）。
  const payeeGroups = payeeOptions(masterData.payees, currentUserId, state.payeeSelect);
  // 手入力の店名が支払い先の名前か別名と一致するときは、保存時にその支払い先へ変換されることを案内する
  // （入力中は何も変えない。自分が非表示にしている支払い先も対象。docs/分析拡充/要件定義書.md 4.7節）
  const convertTo =
    state.payeeSelect === SELECT_NONE_VALUE
      ? findPayeeByName(masterData.payees, state.payeeInputText)
      : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">
        レシート単位情報
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="支払い先"
          value={state.payeeSelect}
          onChange={(e) => onChange({ payeeSelect: e.target.value })}
        >
          <option value="">選択してください</option>
          <option value={SELECT_NONE_VALUE}>該当なし</option>
          {payeeGroups.current && (
            <option value={payeeGroups.current.id}>
              {payeeOptionLabel(payeeGroups.current, currentUserId)}
            </option>
          )}
          {payeeGroups.options.map((payee) => (
            <option key={payee.id} value={payee.id}>
              {payee.name}
            </option>
          ))}
        </Select>

        {state.payeeSelect === SELECT_NONE_VALUE && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">支払い先名（手入力）</span>
            <input
              type="text"
              value={state.payeeInputText}
              onChange={(e) => onChange({ payeeInputText: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {convertTo && (
              <span className="text-xs text-indigo-600">
                保存時に「{convertTo.name}」として保存されます
              </span>
            )}
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">日時</span>
          <input
            type="datetime-local"
            value={state.datetime}
            onChange={(e) => onChange({ datetime: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <Select
          label="支出 / 返金"
          value={state.transactionTypeId}
          onChange={(e) => onChange({ transactionTypeId: e.target.value })}
          error={fieldErrors?.transactionTypeId}
        >
          {masterData.transactionTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>

        {showPayerSelect && (
          <Select
            label="支払者"
            value={state.payerUserId}
            onChange={(e) => onChange({ payerUserId: e.target.value })}
          >
            <option value="">選択してください</option>
            {masterData.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </Select>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">合計金額</span>
          <input
            type="text"
            inputMode="numeric"
            value={state.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              fieldErrors?.amount ? "border-red-400" : "border-slate-300"
            }`}
          />
        </label>
      </div>
    </section>
  );
}
