"use client";

import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: boolean;
};

export function Select({
  label,
  error,
  className = "",
  children,
  ...props
}: SelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-slate-700">{label}</span>}
      <select
        className={`rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          error ? "border-red-400" : "border-slate-300"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
