"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faEquals } from "@fortawesome/free-solid-svg-icons";

import { Select } from "@/components/ui/Select";
import type { MasterData, ReceiptItem } from "@/types/receipt";

type ReceiptItemCardProps = {
  index: number;
  item: ReceiptItem;
  showSameAsAmountButton: boolean;
  amount: string;
  onChange: (patch: Partial<ReceiptItem>) => void;
  onRemove: () => void;
  masterData: Pick<
    MasterData,
    "consumptionTaxes" | "categories" | "purposes" | "scenes"
  >;
};

export function ReceiptItemCard({
  index,
  item,
  showSameAsAmountButton,
  amount,
  onChange,
  onRemove,
  masterData,
}: ReceiptItemCardProps) {
  const toggleScene = (sceneId: string) => {
    const sceneIds = item.sceneIds.includes(sceneId)
      ? item.sceneIds.filter((id) => id !== sceneId)
      : [...item.sceneIds, sceneId];
    onChange({ sceneIds });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-500">
          項目 {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-500 hover:text-red-700"
          aria-label="項目を削除"
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">商品名</span>
          <input
            type="text"
            value={item.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">価格</span>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={item.price}
              onChange={(e) => onChange({ price: e.target.value })}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {showSameAsAmountButton && (
              <button
                type="button"
                onClick={() => onChange({ price: amount })}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faEquals} />
                合計と同じ
              </button>
            )}
          </div>
        </div>

        <Select
          label="税率"
          value={item.taxRateId}
          onChange={(e) => onChange({ taxRateId: e.target.value })}
        >
          <option value="">選択してください</option>
          {masterData.consumptionTaxes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>

        <Select
          label="カテゴリー"
          value={item.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
        >
          <option value="">選択してください</option>
          {masterData.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select
          label="目的"
          value={item.purposeId}
          onChange={(e) => onChange({ purposeId: e.target.value })}
        >
          <option value="">選択してください</option>
          {masterData.purposes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        <div>
          <span className="text-sm font-medium text-slate-700">
            シーン（任意・複数選択可）
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {masterData.scenes.map((scene) => {
              const checked = item.sceneIds.includes(String(scene.id));
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => toggleScene(String(scene.id))}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    checked
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {scene.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
