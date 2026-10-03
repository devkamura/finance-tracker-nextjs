"use client";

import {
  NamedItemListManager,
  type NamedListItem,
} from "@/components/settings/NamedItemListManager";
import { createTag, deleteTag, updateTag } from "@/lib/actions/settings/tags";
import type { Tag } from "@/lib/receipts/labels";

function toListItem(tag: Tag): NamedListItem {
  return { id: tag.id, name: tag.name, isHidden: tag.isHidden, editable: true };
}

// 設定 ＞ タグ（docs/分析拡充/基本設計書.md 2.5節）。追加・名前の変更・表示/非表示・削除。
// タグは集計に使わないため、グループのメンバー全員が編集できる（基本設計書 Q2）。
export function TagSettingsManager({ tags }: { tags: Tag[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        レシートの明細に任意で付けるラベルです（複数選択可）。使われているタグは削除できないため、
        選択肢から外すときは非表示にしてください。
      </p>
      <NamedItemListManager
        label="タグ"
        placeholder="タグを追加（例：朝食）"
        initialItems={tags.map(toListItem)}
        canEdit
        onCreate={async (name) => {
          const result = await createTag(name);
          return result.success ? { success: true, item: toListItem(result.tag) } : result;
        }}
        onUpdate={async (item, patch) => {
          const result = await updateTag(item.id, patch);
          return result.success ? { success: true, item: toListItem(result.tag) } : result;
        }}
        onDelete={async (item) => {
          const result = await deleteTag(item.id);
          return result.success ? { success: true, item: null } : result;
        }}
      />
    </div>
  );
}
