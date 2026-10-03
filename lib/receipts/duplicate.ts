import type { ReceiptItem } from "@/types/receipt";

// 相方分レシートの同時登録（複製登録）用のヘルパー。
// サーバーアクションとクライアント（登録画面）の両方から使うため server-only にはしない。

// グループ（最大2人）の中から、ログインユーザー以外のメンバー＝相方を返す。
// 相方がいない（1人グループ）場合はnullを返す。
export function findPartner<T extends { userId: string }>(
  members: T[],
  currentUserId: string
): T | null {
  return members.find((m) => m.userId !== currentUserId) ?? null;
}

// 複製レシート用の明細を作る。帰属先は「私→相方」のみ置き換え、
// 「相方」「共同」はそのまま（相方のために買った物が複製で私の物にならないように）。
// それ以外の項目（商品名・価格・税区分・税率・カテゴリー・内訳・相手・タグ）は元と同じ。
export function buildPartnerItems(
  items: ReceiptItem[],
  currentUserId: string,
  partnerUserId: string
): ReceiptItem[] {
  return items.map((item) => {
    const ownerUserId =
      item.ownerUserId === currentUserId ? partnerUserId : item.ownerUserId;
    return { ...item, tagIds: [...item.tagIds], ownerUserId };
  });
}
