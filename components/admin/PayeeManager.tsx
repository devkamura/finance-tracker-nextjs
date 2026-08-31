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
import { createPayee } from "@/lib/actions/create-payee";
import { deletePayee } from "@/lib/actions/delete-payee";
import { updatePayee } from "@/lib/actions/update-payee";

type Payee = { id: number; name: string };

export function PayeeManager({ initialPayees }: { initialPayees: Payee[] }) {
  const [payees, setPayees] = useState(initialPayees);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortByName = (list: Payee[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createPayee(newName);
      if (result.success) {
        setPayees((prev) => sortByName([...prev, result.payee]));
        setNewName("");
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  const startEdit = (payee: Payee) => {
    setEditingId(payee.id);
    setDraft(payee.name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleUpdate = (id: number) => {
    startTransition(async () => {
      const result = await updatePayee(id, draft);
      if (result.success) {
        setPayees((prev) =>
          sortByName(prev.map((p) => (p.id === id ? result.payee : p)))
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
      const result = await deletePayee(id);
      if (result.success) {
        setPayees((prev) => prev.filter((p) => p.id !== id));
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
            label="支払い先名"
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
      {payees.length === 0 ? (
        <p className="text-sm text-slate-500">支払い先が登録されていません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {payees.map((payee) => (
            <li
              key={payee.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              {editingId === payee.id ? (
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
                    onClick={() => handleUpdate(payee.id)}
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
                  <span className="text-sm text-slate-900">{payee.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(payee)}
                      aria-label="編集"
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(payee.id)}
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
