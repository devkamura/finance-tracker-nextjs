"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera } from "@fortawesome/free-solid-svg-icons";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { extractReceiptOcr } from "@/lib/actions/extract-receipt-ocr";
import type { OcrReceiptResult } from "@/types/receipt";

type OcrUploadSectionProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onExtracted: (result: OcrReceiptResult) => void;
  onError: (message: string) => void;
};

// 要件定義書9〜10章：画像保存とOCRは別機能。ここで選択した画像は
// OCRを実行してもしなくても、そのままレシート画像として保存対象になる
// （選択したFileはReceiptFormが保持し、送信時にcreateReceiptへ渡す）。
export function OcrUploadSection({
  file,
  onFileChange,
  onExtracted,
  onError,
}: OcrUploadSectionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // <input type="file">はDOM側に選択済みファイル名を保持し続けるため、
  // 送信成功時にReceiptForm側でfileをnullへ戻しても表示上は選択済みのまま
  // 残ってしまう（実際に再送信されるわけではないが紛らわしい）。
  // fileがnullになったらネイティブinputの値も明示的にクリアする。
  useEffect(() => {
    if (file === null && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [file]);

  const handleExtractClick = () => {
    if (!file) {
      onError("画像を選択してください。");
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmExtract = () => {
    setConfirmOpen(false);
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    startTransition(async () => {
      const result = await extractReceiptOcr(formData);
      if (result.success) {
        onExtracted(result.data);
      } else {
        onError(result.error);
      }
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">
        レシート画像
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        選択した画像はレシートに保存されます。「画像から読み取る」を押すと、
        Geminiがレシートを読み取り下記のフォームに自動入力します（読み取り結果は送信前に必ず確認してください）。
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/heic,image/heif"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-slate-700 hover:file:bg-slate-50 sm:flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleExtractClick}
          disabled={isPending || !file}
          className="shrink-0 whitespace-nowrap"
        >
          <FontAwesomeIcon icon={faCamera} />
          {isPending ? "読み取り中..." : "画像から読み取る"}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="画像を読み取りますか？"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConfirmExtract}>読み取る</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Gemini APIを使用してこの画像を読み取ります。APIの利用回数がかかるため、内容を確認してから実行してください。
        </p>
      </Modal>
    </section>
  );
}
