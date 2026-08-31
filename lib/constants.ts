// 店舗セレクトで「該当なし」を選択したことを示すセンチネル値。
// DBのStoreテーブルの実IDとは独立させることで、
// Django版のような「該当なし=ID固定」への依存を避ける。
export const SELECT_NONE_VALUE = "none";

// 明細の帰属先セレクトで「共同」を選択したことを示すセンチネル値。
// DB上はowner_user_id = NULLで表現する（docs/basic-design.md 2.2節）。
export const OWNER_JOINT_VALUE = "joint";

// OCRで受け付ける画像の拡張子とMIMEタイプ（レシート画像の保存にも流用する）
export const OCR_ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".heic", ".heif"];
export const OCR_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
];

// レシート画像用Supabase Storageバケット名（docs/basic-design.md 4章）
export const RECEIPT_IMAGES_BUCKET = "receipt-images";
