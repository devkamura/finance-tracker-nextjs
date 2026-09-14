// レシート画像は最近のスマートフォンカメラだと数MB〜十数MBになることがあり、
// そのままSupabase Storageへ保存すると容量を圧迫する。OCR（文字認識）に
// 必要な解像度はそこまで高くないため、長辺が一定値を超える場合のみ縮小して
// から保存・OCR送信する（OCR実行前後どちらでも同じファイルを使い回すため、
// アップロード容量とGemini APIへの送信サイズの両方を削減できる）。

// レシートの文字（特に小さな価格・日時）を判読できる下限を確保しつつ、
// 一般的なスマートフォン写真（4000px超）を大幅に縮小できる値。
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

// 画像ファイルをOCRに十分な解像度まで縮小する。
// 既に十分小さい場合や、ブラウザがデコードできない形式（例：一部環境のHEIC）
// の場合は、元のファイルをそのまま返す。
export async function resizeImageForOcr(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = MAX_DIMENSION / Math.max(bitmap.width, bitmap.height);
      if (scale >= 1) {
        return file;
      }

      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      if (!blob) {
        return file;
      }

      const resizedName = `${file.name.replace(/\.[^./]+$/, "")}.jpg`;
      return new File([blob], resizedName, { type: "image/jpeg" });
    } finally {
      bitmap.close();
    }
  } catch {
    // HEIC等、ブラウザが直接デコードできない形式では縮小をスキップする。
    return file;
  }
}
