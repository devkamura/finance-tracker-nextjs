"use client";

import { useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faEye,
  faEyeSlash,
  faPen,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import { createBreakdown } from "@/lib/actions/settings/create-breakdown";
import { deleteBreakdown } from "@/lib/actions/settings/delete-breakdown";
import { updateBreakdown } from "@/lib/actions/settings/update-breakdown";
import { updateCategoryCostType } from "@/lib/actions/settings/update-category-cost-type";
import { COST_TYPE_LABELS, type CategoryBreakdown, type CostType } from "@/lib/receipts/breakdowns";
import type { CategoryWithCostType } from "@/lib/settings/queries";

type CategorySettingsManagerProps = {
  categories: CategoryWithCostType[];
  initialBreakdowns: CategoryBreakdown[];
  // 登録済みのレシートで使われている内訳（削除できないため、ゴミ箱を非活性にする）
  usedBreakdownIds: number[];
  canEdit: boolean; // 管理者のみ編集できる
};

// 設定 ＞ カテゴリ（docs/分析拡充/基本設計書.md 2.3節）。
// カテゴリごとに費用区分（固定費／変動費）と内訳（追加・名前の変更・表示/非表示・削除）を設定する。
// カテゴリ自体の追加・削除はしない（アプリ共通のマスタ）。
export function CategorySettingsManager({
  categories,
  initialBreakdowns,
  usedBreakdownIds,
  canEdit,
}: CategorySettingsManagerProps) {
  const [costTypes, setCostTypes] = useState(
    () => new Map(categories.map((c) => [c.id, c.costType]))
  );
  const [breakdowns, setBreakdowns] = useState(initialBreakdowns);
  const [newNames, setNewNames] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  // エラーは操作した場所のすぐ下に出す（カテゴリの枠の下だと、内訳が多いと画面の外になるため）。
  // target は "costType"（費用区分）・"add"（内訳の追加欄）・内訳のID（名前の変更・表示/非表示・削除）
  type ErrorTarget = "costType" | "add" | number;
  const [error, setError] = useState<
    { categoryId: number; target: ErrorTarget; message: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const run = (
    categoryId: number,
    target: ErrorTarget,
    action: () => Promise<string | null>
  ) => {
    startTransition(async () => {
      const message = await action();
      setError(message ? { categoryId, target, message } : null);
    });
  };
  const errorAt = (categoryId: number, target: ErrorTarget) =>
    error?.categoryId === categoryId && error.target === target ? error.message : null;

  const changeCostType = (categoryId: number, costType: CostType) =>
    run(categoryId, "costType", async () => {
      const result = await updateCategoryCostType(categoryId, costType);
      if (!result.success) return result.error;
      setCostTypes((prev) => new Map(prev).set(categoryId, costType));
      return null;
    });

  const addBreakdown = (categoryId: number) =>
    run(categoryId, "add", async () => {
      const result = await createBreakdown(categoryId, newNames[categoryId] ?? "");
      if (!result.success) return result.error;
      setBreakdowns((prev) => [...prev, result.breakdown]);
      setNewNames((prev) => ({ ...prev, [categoryId]: "" }));
      return null;
    });

  const saveName = (breakdown: CategoryBreakdown) =>
    run(breakdown.categoryId, breakdown.id, async () => {
      const result = await updateBreakdown(breakdown.id, { name: draft });
      if (!result.success) return result.error;
      setBreakdowns((prev) => prev.map((b) => (b.id === breakdown.id ? result.breakdown : b)));
      setEditingId(null);
      return null;
    });

  const toggleHidden = (breakdown: CategoryBreakdown) =>
    run(breakdown.categoryId, breakdown.id, async () => {
      const result = await updateBreakdown(breakdown.id, { isHidden: !breakdown.isHidden });
      if (!result.success) return result.error;
      setBreakdowns((prev) => prev.map((b) => (b.id === breakdown.id ? result.breakdown : b)));
      return null;
    });

  const remove = (breakdown: CategoryBreakdown) =>
    run(breakdown.categoryId, breakdown.id, async () => {
      const result = await deleteBreakdown(breakdown.id);
      if (!result.success) return result.error;
      setBreakdowns((prev) => prev.filter((b) => b.id !== breakdown.id));
      return null;
    });

  return (
    <div className="flex flex-col gap-3">
      {!canEdit && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          カテゴリの設定は管理者のみ編集できます。
        </p>
      )}
      <p className="text-xs text-slate-500">
        内訳を設定したカテゴリでは、レシート登録時に内訳の選択が必須になります。
        使われている内訳は削除できないため、選択肢から外すときは非表示にしてください。
      </p>

      {categories.map((category) => {
        const items = breakdowns.filter((b) => b.categoryId === category.id);
        const costType = costTypes.get(category.id) ?? category.costType;
        return (
          <section
            key={category.id}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-slate-900">{category.name}</h2>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                費用区分
                <select
                  value={costType}
                  onChange={(e) => changeCostType(category.id, e.target.value as CostType)}
                  disabled={!canEdit || isPending}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 disabled:bg-slate-50"
                >
                  {(Object.keys(COST_TYPE_LABELS) as CostType[]).map((type) => (
                    <option key={type} value={type}>
                      {COST_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {errorAt(category.id, "costType") && (
              <p className="text-sm text-red-600">{errorAt(category.id, "costType")}</p>
            )}

            {items.length === 0 ? (
              <p className="text-xs text-slate-400">内訳なし</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100">
                {items.map((breakdown) => (
                  <li key={breakdown.id} className="flex flex-col gap-1 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      {editingId === breakdown.id ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            disabled={isPending}
                            autoFocus
                            aria-label="内訳名"
                            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => saveName(breakdown)}
                            disabled={isPending}
                            aria-label="保存"
                            className="text-emerald-600 hover:text-emerald-800"
                          >
                            <FontAwesomeIcon icon={faCheck} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={isPending}
                            aria-label="キャンセル"
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span
                            className={`text-sm ${breakdown.isHidden ? "text-slate-400 line-through" : "text-slate-800"}`}
                          >
                            {breakdown.name}
                            {breakdown.isHidden && (
                              <span className="ml-2 text-xs no-underline">（非表示）</span>
                            )}
                          </span>
                          {canEdit && (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(breakdown.id);
                                  setDraft(breakdown.name);
                                }}
                                disabled={isPending}
                                aria-label="名前を変更"
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <FontAwesomeIcon icon={faPen} />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleHidden(breakdown)}
                                disabled={isPending}
                                aria-label={breakdown.isHidden ? "表示する" : "非表示にする"}
                                title={breakdown.isHidden ? "表示する" : "非表示にする"}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <FontAwesomeIcon icon={breakdown.isHidden ? faEye : faEyeSlash} />
                              </button>
                              <button
                                type="button"
                                onClick={() => remove(breakdown)}
                                disabled={isPending || usedBreakdownIds.includes(breakdown.id)}
                                aria-label={
                                  usedBreakdownIds.includes(breakdown.id)
                                    ? "削除（使用中のため削除できません）"
                                    : "削除"
                                }
                                title={
                                  usedBreakdownIds.includes(breakdown.id)
                                    ? "登録済みのレシートで使われているため削除できません。非表示にしてください。"
                                    : "削除"
                                }
                                className={
                                  usedBreakdownIds.includes(breakdown.id)
                                    ? "cursor-not-allowed text-slate-300"
                                    : "text-red-400 hover:text-red-600"
                                }
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {errorAt(category.id, breakdown.id) && (
                      <p className="text-sm text-red-600">{errorAt(category.id, breakdown.id)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addBreakdown(category.id);
                }}
              >
                <input
                  type="text"
                  value={newNames[category.id] ?? ""}
                  onChange={(e) =>
                    setNewNames((prev) => ({ ...prev, [category.id]: e.target.value }))
                  }
                  disabled={isPending}
                  placeholder="内訳を追加（例：外食）"
                  aria-label={`${category.name}の内訳を追加`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  追加
                </button>
              </form>
            )}

            {errorAt(category.id, "add") && (
              <p className="text-sm text-red-600">{errorAt(category.id, "add")}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
