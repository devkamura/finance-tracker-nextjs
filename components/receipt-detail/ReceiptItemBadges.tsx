import { Badge } from "@/components/ui/Badge";
import { getOwnerBadgeClass } from "@/lib/user-colors";
import type { ReceiptDetailItemView } from "@/types/receipt";

// レシート詳細・一覧アコーディオンで共通利用する、明細1件分のラベル付きバッジ表示。
export function ReceiptItemBadges({ item }: { item: ReceiptDetailItemView }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <Badge label="カテゴリ" value={item.categoryName} />
      <Badge label="目的" value={item.purposeName} />
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${getOwnerBadgeClass(item.ownerUserId, item.ownerColor)}`}
      >
        <span className={item.ownerUserId === null ? "text-slate-200" : "text-slate-400"}>
          帰属先
        </span>
        <span className="font-medium">{item.ownerDisplayName}</span>
      </span>
      <Badge
        value={
          item.taxType === "exclusive" && item.taxRateName
            ? `税別 ${item.taxRateName}`
            : "税込"
        }
      />
      {item.sceneNames.length > 0 && (
        <Badge label="シーン" value={item.sceneNames.join("・")} />
      )}
    </div>
  );
}
