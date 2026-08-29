"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

import { removeGroupMember } from "@/lib/actions/remove-group-member";

export function RemoveMemberButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRemove = () => {
    if (!window.confirm("このメンバーをグループから削除しますか？")) {
      return;
    }
    startTransition(async () => {
      const result = await removeGroupMember(memberId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        aria-label="削除"
        className="text-red-400 hover:text-red-600"
      >
        <FontAwesomeIcon icon={faTrash} />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
