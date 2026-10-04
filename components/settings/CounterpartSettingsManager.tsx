"use client";

import {
  NamedItemListManager,
  type NamedListItem,
} from "@/components/settings/NamedItemListManager";
import {
  createCounterpart,
  deleteCounterpart,
  updateCounterpart,
} from "@/lib/actions/settings/counterparts";
import type { Counterpart } from "@/lib/receipts/labels";

const KIND_NOTES: Record<Counterpart["kind"], string | undefined> = {
  member: "メンバー",
  default: "既定",
  custom: undefined,
};

function toListItem(counterpart: Counterpart, used: boolean): NamedListItem {
  return {
    id: counterpart.id,
    name: counterpart.name,
    isHidden: counterpart.isHidden,
    editable: counterpart.kind === "custom",
    note: KIND_NOTES[counterpart.kind],
    used,
  };
}

// 設定 ＞ 相手（docs/分析拡充/基本設計書.md 2.4節）。
// メンバー・既定の相手は表示・非表示だけ、任意の相手は追加・名前の変更・削除もできる。編集は管理者のみ。
export function CounterpartSettingsManager({
  counterparts,
  usedCounterpartIds,
  canEdit,
}: {
  counterparts: Counterpart[];
  usedCounterpartIds: number[]; // 登録済みのレシートで使われている相手（ゴミ箱を非活性にする）
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {!canEdit && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          相手の設定は管理者のみ編集できます。
        </p>
      )}
      <p className="text-xs text-slate-500">
        レシートの明細ごとに「誰と・誰のために使ったか」を選びます。非表示にした相手は登録画面の選択肢に出ません。
        メンバーの名前は管理画面の表示名に連動します。
      </p>
      <NamedItemListManager
        label="相手"
        placeholder="相手を追加（例：会社の同僚）"
        initialItems={counterparts.map((c) => toListItem(c, usedCounterpartIds.includes(c.id)))}
        canEdit={canEdit}
        onCreate={async (name) => {
          const result = await createCounterpart(name);
          if (!result.success) return result;
          return {
            success: true,
            item: {
              id: result.counterpart.id,
              name: result.counterpart.name ?? name.trim(),
              isHidden: result.counterpart.isHidden,
              editable: true,
            },
          };
        }}
        onUpdate={async (item, patch) => {
          const result = await updateCounterpart(item.id, patch);
          if (!result.success) return result;
          // メンバーの相手は名前を持たないため、今の表示名のままにする
          return {
            success: true,
            item: {
              ...item,
              name: result.counterpart.name ?? item.name,
              isHidden: result.counterpart.isHidden,
            },
          };
        }}
        onDelete={async (item) => {
          const result = await deleteCounterpart(item.id);
          return result.success ? { success: true, item: null } : result;
        }}
      />
    </div>
  );
}
