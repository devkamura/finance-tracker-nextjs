"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

type SubmitLoadingOverlayProps = {
  show: boolean;
};

export function SubmitLoadingOverlay({ show }: SubmitLoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-900/50 text-white">
      <FontAwesomeIcon icon={faSpinner} spin size="2x" />
      <p className="text-sm">送信中...</p>
    </div>
  );
}
