import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { RECEIPT_IMAGES_BUCKET } from "@/lib/constants";

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/heic": "heic",
  "image/heif": "heif",
};

// レシート画像をSupabase Storageへアップロードし、保存先パスを返す。
// パス構成 {group_id}/{receipt_id}/{uuid}.{ext} は、パス先頭のgroup_idを
// storage.objectsのRLSポリシーがそのまま所属グループ判定に使う前提になっている。
export async function uploadReceiptImage(
  supabase: SupabaseClient,
  groupId: string,
  receiptId: string,
  file: File
): Promise<string> {
  const extension = EXTENSION_BY_MIME_TYPE[file.type] ?? "bin";
  const path = `${groupId}/${receiptId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(RECEIPT_IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) {
    throw error;
  }

  return path;
}

// 画像差し替え・レシート削除時に旧オブジェクトを同期削除する（docs/basic-design.md 4章）。
export async function deleteReceiptImage(
  supabase: SupabaseClient,
  path: string
): Promise<void> {
  await supabase.storage.from(RECEIPT_IMAGES_BUCKET).remove([path]);
}

// 非公開バケットのため、詳細画面での表示には都度署名付きURLを発行する。
export async function getReceiptImageSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(RECEIPT_IMAGES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}
