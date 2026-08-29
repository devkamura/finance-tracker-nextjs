// 店舗セレクトで「該当なし」を選択したことを示すセンチネル値。
// DBのStoreテーブルの実IDとは独立させることで、
// Django版のような「該当なし=ID固定」への依存を避ける。
export const SELECT_NONE_VALUE = "none";

export const GDRIVE_RECEIPT_MIME_TYPE = "application/json";

// OCRで受け付ける画像の拡張子とMIMEタイプ
export const OCR_ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".heic", ".heif"];
export const OCR_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
];
