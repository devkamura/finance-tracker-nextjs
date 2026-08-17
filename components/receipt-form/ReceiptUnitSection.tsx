"use client";

import { Select } from "@/components/ui/Select";
import { SELECT_NONE_VALUE } from "@/lib/constants";
import type { MasterData, ReceiptFormState } from "@/types/receipt";

type ReceiptUnitSectionProps = {
  state: ReceiptFormState;
  onChange: (patch: Partial<ReceiptFormState>) => void;
  masterData: Pick<MasterData, "stores" | "transactionTypes">;
};

export function ReceiptUnitSection({
  state,
  onChange,
  masterData,
}: ReceiptUnitSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">
        レシート単位情報
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="店舗"
          value={state.storeSelect}
          onChange={(e) => onChange({ storeSelect: e.target.value })}
        >
          <option value="">選択してください</option>
          <option value={SELECT_NONE_VALUE}>該当なし</option>
          {masterData.stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </Select>

        {state.storeSelect === SELECT_NONE_VALUE && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">店舗名（手入力）</span>
            <input
              type="text"
              value={state.storeInputText}
              onChange={(e) => onChange({ storeInputText: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
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
        >
          {masterData.transactionTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">合計金額</span>
          <input
            type="text"
            inputMode="numeric"
            value={state.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>
    </section>
  );
}
