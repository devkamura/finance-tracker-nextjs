"use client";

import { useState, useTransition } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faPen,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createStore } from "@/lib/actions/create-store";
import { deleteStore } from "@/lib/actions/delete-store";
import { updateStore } from "@/lib/actions/update-store";

type Store = { id: number; name: string };

export function StoreManager({ initialStores }: { initialStores: Store[] }) {
  const [stores, setStores] = useState(initialStores);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortByName = (list: Store[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createStore(newName);
      if (result.success) {
        setStores((prev) => sortByName([...prev, result.store]));
        setNewName("");
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  const startEdit = (store: Store) => {
    setEditingId(store.id);
    setDraft(store.name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleUpdate = (id: number) => {
    startTransition(async () => {
      const result = await updateStore(id, draft);
      if (result.success) {
        setStores((prev) =>
          sortByName(prev.map((s) => (s.id === id ? result.store : s)))
        );
        setEditingId(null);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  const handleDelete = (id: number) => {
    startTransition(async () => {
      const result = await deleteStore(id);
      if (result.success) {
        setStores((prev) => prev.filter((s) => s.id !== id));
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
      >
        <div className="flex-1">
          <Input
            label="店舗名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isPending}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          追加
        </Button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {stores.length === 0 ? (
        <p className="text-sm text-slate-500">店舗が登録されていません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {stores.map((store) => (
            <li
              key={store.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              {editingId === store.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={isPending}
                    autoFocus
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate(store.id)}
                    disabled={isPending}
                    aria-label="保存"
                    className="text-emerald-600 hover:text-emerald-800"
                  >
                    <FontAwesomeIcon icon={faCheck} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={isPending}
                    aria-label="キャンセル"
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm text-slate-900">{store.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(store)}
                      aria-label="編集"
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(store.id)}
                      aria-label="削除"
                      className="text-red-400 hover:text-red-600"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
