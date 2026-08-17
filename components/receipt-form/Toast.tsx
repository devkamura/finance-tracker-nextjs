"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";

export type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type ToastProps = {
  toast: ToastState;
  onDismiss: () => void;
};

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  const isSuccess = toast.type === "success";

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
          isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}
      >
        <FontAwesomeIcon
          icon={isSuccess ? faCircleCheck : faCircleExclamation}
          className="mt-0.5"
        />
        <p className="text-sm">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-2 text-xs text-slate-400 hover:text-slate-600"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
