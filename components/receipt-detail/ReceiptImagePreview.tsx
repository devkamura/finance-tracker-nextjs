"use client";

import { useState } from "react";

type ReceiptImagePreviewProps = {
  url: string;
};

// レシート画像のサムネイル表示。クリックすると全画面に近い拡大表示で閲覧できる。
export function ReceiptImagePreview({ url }: ReceiptImagePreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 block w-full cursor-zoom-in"
        aria-label="レシート画像を拡大表示"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="レシート画像"
          className="max-h-96 rounded-lg border border-slate-200 object-contain"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-slate-900/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="レシート画像（拡大）"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="閉じる"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 hover:bg-white"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
