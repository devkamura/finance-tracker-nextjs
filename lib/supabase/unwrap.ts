// SupabaseのTS型生成は、外部キーにUNIQUE制約がない多対一のネスト選択でも
// 生成型を配列（`{ name: string }[]`）にすることがある一方、PostgRESTは
// 実行時には単一オブジェクト（または null）を返す。この差異を吸収するヘルパー。
export function unwrapToOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
