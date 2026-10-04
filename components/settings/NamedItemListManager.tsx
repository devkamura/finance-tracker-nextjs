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

export type NamedListItem = {
  id: number;
  name: string;
  isHidden: boolean;
  // 名前の変更・削除ができるか（相手のメンバー・既定はできない。表示・非表示のみ）
  editable: boolean;
  // 名前の後ろに添える説明（例：「メンバー」「既定」）
  note?: string;
  // 登録済みのレシートで使われているか。使われているものは削除できないため、ゴミ箱を非活性にする
  used?: boolean;
};

// 操作の結果。成功時は更新後の項目（削除は null）を返す
type ActionResult<T> = Promise<{ success: true; item: T } | { success: false; error: string }>;

type NamedItemListManagerProps = {
  label: string; // 「相手」「タグ」
  placeholder: string;
  initialItems: NamedListItem[];
  canEdit: boolean; // 管理者のみ編集できる
  onCreate: (name: string) => ActionResult<NamedListItem>;
  onUpdate: (
    item: NamedListItem,
    patch: { name?: string; isHidden?: boolean }
  ) => ActionResult<NamedListItem>;
  onDelete: (item: NamedListItem) => ActionResult<null>;
};

// 設定 ＞ 相手・タグの共通の一覧（docs/分析拡充/基本設計書.md 2.4〜2.5節）。
// 追加・名前の変更・表示/非表示・削除。カテゴリの内訳（CategorySettingsManager）と同じ操作感にする。
export function NamedItemListManager({
  label,
  placeholder,
  initialItems,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
}: NamedItemListManagerProps) {
  const [items, setItems] = useState(initialItems);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  // エラーは操作した場所のすぐ下に出す（一覧の下だと画面の外になるため）。
  // target は項目のID（名前の変更・表示/非表示・削除）か "add"（追加欄）
  const [error, setError] = useState<{ target: number | "add"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (target: number | "add", action: () => Promise<string | null>) => {
    startTransition(async () => {
      const message = await action();
      setError(message ? { target, message } : null);
    });
  };

  // 名前の変更・表示/非表示では使われているかは変わらないため、元の値を引き継ぐ
  const replace = (updated: NamedListItem) =>
    setItems((prev) =>
      prev.map((i) => (i.id === updated.id ? { ...updated, used: i.used } : i))
    );

  const add = () =>
    run("add", async () => {
      const result = await onCreate(newName);
      if (!result.success) return result.error;
      setItems((prev) => [...prev, result.item]);
      setNewName("");
      return null;
    });

  const saveName = (item: NamedListItem) =>
    run(item.id, async () => {
      const result = await onUpdate(item, { name: draft });
      if (!result.success) return result.error;
      replace(result.item);
      setEditingId(null);
      return null;
    });

  const toggleHidden = (item: NamedListItem) =>
    run(item.id, async () => {
      const result = await onUpdate(item, { isHidden: !item.isHidden });
      if (!result.success) return result.error;
      replace(result.item);
      return null;
    });

  const remove = (item: NamedListItem) =>
    run(item.id, async () => {
      const result = await onDelete(item);
      if (!result.success) return result.error;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      return null;
    });

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{label}なし</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-1.5">
              <div className="flex items-center justify-between gap-2">
                {editingId === item.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={isPending}
                      autoFocus
                      aria-label={`${label}の名前`}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => saveName(item)}
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
                      className={`text-sm ${item.isHidden ? "text-slate-400 line-through" : "text-slate-800"}`}
                    >
                      {item.name}
                      {item.note && (
                        <span className="ml-2 text-xs text-slate-400 no-underline">（{item.note}）</span>
                      )}
                      {item.isHidden && <span className="ml-2 text-xs no-underline">（非表示）</span>}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-3">
                        {item.editable && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setDraft(item.name);
                            }}
                            disabled={isPending}
                            aria-label="名前を変更"
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleHidden(item)}
                          disabled={isPending}
                          aria-label={item.isHidden ? "表示する" : "非表示にする"}
                          title={item.isHidden ? "表示する" : "非表示にする"}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <FontAwesomeIcon icon={item.isHidden ? faEye : faEyeSlash} />
                        </button>
                        {item.editable && (
                          <button
                            type="button"
                            onClick={() => remove(item)}
                            disabled={isPending || item.used}
                            aria-label={item.used ? "削除（使用中のため削除できません）" : "削除"}
                            title={item.used ? "登録済みのレシートで使われているため削除できません。非表示にしてください。" : "削除"}
                            className={
                              item.used
                                ? "cursor-not-allowed text-slate-300"
                                : "text-red-400 hover:text-red-600"
                            }
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {error?.target === item.id && (
                <p className="text-sm text-red-600">{error.message}</p>
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
            add();
          }}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isPending}
            placeholder={placeholder}
            aria-label={`${label}を追加`}
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

      {error?.target === "add" && <p className="text-sm text-red-600">{error.message}</p>}
    </section>
  );
}
