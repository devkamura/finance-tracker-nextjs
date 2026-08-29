"use client";

import { useRef, useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera } from "@fortawesome/free-solid-svg-icons";

import { Button } from "@/components/ui/Button";
import { extractReceiptOcr } from "@/lib/actions/extract-receipt-ocr";
import type { OcrReceiptResult } from "@/types/receipt";

type OcrUploadSectionProps = {
  onExtracted: (result: OcrReceiptResult) => void;
  onError: (message: string) => void;
};

export function OcrUploadSection({ onExtracted, onError }: OcrUploadSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleExtract = () => {
    if (!file) {
      onError("画像を選択してください。");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    startTransition(async () => {
      const result = await extractReceiptOcr(formData);
      if (result.success) {
        onExtracted(result.data);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        onError(result.error);
      }
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">
        レシート画像から自動入力
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        画像をアップロードすると、Geminiがレシートを読み取り下記のフォームに自動入力します。読み取り結果は送信前に必ず確認してください。
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/heic,image/heif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700 hover:file:bg-slate-50 sm:flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleExtract}
          disabled={isPending || !file}
          className="shrink-0 whitespace-nowrap"
        >
          <FontAwesomeIcon icon={faCamera} />
          {isPending ? "読み取り中..." : "画像から読み取る"}
        </Button>
      </div>
    </section>
  );
}
