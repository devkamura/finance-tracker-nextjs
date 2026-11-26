// 支払い先セレクトで「該当なし」を選択したことを示すセンチネル値。
// DBのPayeeテーブルの実IDとは独立させることで、
// Django版のような「該当なし=ID固定」への依存を避ける。
export const SELECT_NONE_VALUE = "none";

// 明細の帰属先セレクトで「共同」を選択したことを示すセンチネル値。
// DB上はowner_user_id = NULLで表現する（docs/basic-design.md 2.2節）。
export const OWNER_JOINT_VALUE = "joint";

// 支払い先の共通の既定値で、相手・帰属先に「登録する人」を選んだことを示すセンチネル値（Issue #44）。
// レシートの入力で既定値を入れるときに、操作しているメンバー本人に置き換える（明細・レシートには残らない）。
// DB上は payees.default_counterpart_registrant・default_owner_registrant = true で表現する。
export const REGISTRANT_VALUE = "registrant";
export const REGISTRANT_LABEL = "登録する人";

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
