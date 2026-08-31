"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrash,
  faEquals,
  faChevronDown,
  faChevronUp,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import { Select } from "@/components/ui/Select";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import type { ReceiptItemFieldErrors } from "@/lib/validation/receipt-rules";
import type { MasterData, ReceiptItem } from "@/types/receipt";

// アコーディオンのヘッダーに表示する商品名は長くなりすぎないよう切り詰める。
const MAX_ITEM_NAME_LENGTH = 10;

type ReceiptItemCardProps = {
  index: number;
  item: ReceiptItem;
  isOpen: boolean;
  onToggleOpen: () => void;
  showSameAsAmountButton: boolean;
  showRemoveButton: boolean;
  amount: string;
  onChange: (patch: Partial<ReceiptItem>) => void;
  onRemove: () => void;
  fieldErrors?: ReceiptItemFieldErrors;
  masterData: Pick<
    MasterData,
    "consumptionTaxes" | "categories" | "purposes" | "scenes" | "members"
  >;
};

export function ReceiptItemCard({
  index,
  item,
  isOpen,
  onToggleOpen,
  showSameAsAmountButton,
  showRemoveButton,
  amount,
  onChange,
  onRemove,
  fieldErrors,
  masterData,
}: ReceiptItemCardProps) {
  const toggleScene = (sceneId: string) => {
    const sceneIds = item.sceneIds.includes(sceneId)
      ? item.sceneIds.filter((id) => id !== sceneId)
      : [...item.sceneIds, sceneId];
    onChange({ sceneIds });
  };

  const truncatedName = item.name.slice(0, MAX_ITEM_NAME_LENGTH);
  const heading = truncatedName
    ? `項目${index + 1}_${truncatedName}`
    : `項目${index + 1}`;
  const hasError = Boolean(
    fieldErrors &&
      Object.values(fieldErrors).some((invalid) => invalid === true)
  );

  return (
    <div
      className={`rounded-xl border bg-white p-4 ${hasError ? "border-red-300" : "border-slate-200"}`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          className={`flex flex-1 items-center gap-2 text-left text-sm font-semibold ${
            hasError ? "text-red-600" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} />
          {heading}
          {hasError && !isOpen && (
            <FontAwesomeIcon icon={faCircleExclamation} className="text-red-500" />
          )}
        </button>
        {showRemoveButton && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-2 text-red-500 hover:text-red-700"
            aria-label="項目を削除"
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        )}
      </div>

      {isOpen && (
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
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  fieldErrors?.price ? "border-red-400" : "border-slate-300"
                }`}
              />
              {showSameAsAmountButton && (
                <button
                  type="button"
                  onClick={() => onChange({ price: amount })}
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <FontAwesomeIcon icon={faEquals} />
                  合計と同じ
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">税区分</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`tax-type-${item.clientId}`}
                  checked={item.taxType === "inclusive"}
                  onChange={() =>
                    onChange({ taxType: "inclusive", taxRateId: "" })
                  }
                />
                税込
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`tax-type-${item.clientId}`}
                  checked={item.taxType === "exclusive"}
                  onChange={() => onChange({ taxType: "exclusive" })}
                />
                税別
              </label>
            </div>
          </div>

          {item.taxType === "exclusive" && (
            <Select
              label="税率"
              value={item.taxRateId}
              onChange={(e) => onChange({ taxRateId: e.target.value })}
              error={fieldErrors?.taxRateId}
            >
              <option value="">選択してください</option>
              {masterData.consumptionTaxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}

          <Select
            label="カテゴリー"
            value={item.categoryId}
            onChange={(e) => onChange({ categoryId: e.target.value })}
            error={fieldErrors?.categoryId}
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
            error={fieldErrors?.purposeId}
          >
            <option value="">選択してください</option>
            {masterData.purposes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Select
            label="帰属先"
            value={item.ownerUserId}
            onChange={(e) => onChange({ ownerUserId: e.target.value })}
            error={fieldErrors?.ownerUserId}
          >
            <option value="">選択してください</option>
            <option value={OWNER_JOINT_VALUE}>共同</option>
            {masterData.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
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
      )}
    </div>
  );
}
