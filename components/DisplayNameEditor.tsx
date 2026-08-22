"use client";

import { useState, useTransition } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPen, faXmark } from "@fortawesome/free-solid-svg-icons";

import { updateDisplayName } from "@/lib/actions/update-display-name";

type DisplayNameEditorProps = {
  initialDisplayName: string;
};

export function DisplayNameEditor({
  initialDisplayName,
}: DisplayNameEditorProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialDisplayName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const startEdit = () => {
    setDraft(displayName);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = () => {
    startTransition(async () => {
      const result = await updateDisplayName(draft);
      if (result.success) {
        setDisplayName(result.displayName);
        setEditing(false);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isPending}
          autoFocus
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          aria-label="保存"
          className="text-emerald-600 hover:text-emerald-800"
        >
          <FontAwesomeIcon icon={faCheck} />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          aria-label="キャンセル"
          className="text-slate-400 hover:text-slate-600"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="flex items-center gap-1 hover:text-slate-900"
    >
      <span>{displayName}</span>
      <FontAwesomeIcon icon={faPen} className="text-xs text-slate-400" />
    </button>
  );
}
