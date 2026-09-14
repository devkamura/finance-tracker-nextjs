// レシート画像は最近のスマートフォンカメラだと数MB〜十数MBになることがあり、
// そのままSupabase Storageへ保存すると容量を圧迫する。一方でレシートは縦に
// 長く幅が狭い形状のことが多く、長辺基準で縮小すると金額欄がある幅方向が
// 大きく縮み、OCRで金額を誤読しやすくなる。そのため保存用（容量優先）と
// OCR送信用（判読精度優先）で異なる上限を使い分ける。
const STORAGE_MAX_DIMENSION = 1600;
const OCR_MAX_DIMENSION = 2600;
const JPEG_QUALITY = 0.85;

async function resizeImage(file: File, maxDimension: number): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = maxDimension / Math.max(bitmap.width, bitmap.height);
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

// レシート画像をStorage保存に十分な解像度まで縮小する。
export async function resizeImageForStorage(file: File): Promise<File> {
  return resizeImage(file, STORAGE_MAX_DIMENSION);
}

// レシート画像をGemini OCR送信に十分な解像度まで縮小する。
// 保存用より上限を高くし、金額欄など小さな文字の判読精度を優先する。
export async function resizeImageForOcr(file: File): Promise<File> {
  return resizeImage(file, OCR_MAX_DIMENSION);
}
