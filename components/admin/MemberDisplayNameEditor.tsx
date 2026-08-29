"use client";

import { useState, useTransition } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPen, faXmark } from "@fortawesome/free-solid-svg-icons";

export type SaveDisplayNameResult =
  | { success: true; displayName: string }
  | { success: false; error: string };

type MemberDisplayNameEditorProps = {
  initialDisplayName: string;
  placeholder?: string;
  onSave: (displayName: string) => Promise<SaveDisplayNameResult>;
};

// 旧DisplayNameEditor.tsx（本人による自己編集）の管理者専用版。
// 参加済みメンバー・招待中(未参加)メンバーのどちらの表示名編集にも使えるよう、
// 保存処理はonSaveとして呼び出し側（MemberList）から注入する。
export function MemberDisplayNameEditor({
  initialDisplayName,
  placeholder,
  onSave,
}: MemberDisplayNameEditorProps) {
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
      const result = await onSave(draft);
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
          className="w-32 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
      className="flex items-center gap-1 text-sm text-slate-900 hover:text-slate-700"
    >
      <span className={displayName ? "" : "text-slate-400"}>
        {displayName || placeholder || "未設定"}
      </span>
      <FontAwesomeIcon icon={faPen} className="text-xs text-slate-400" />
    </button>
  );
}
