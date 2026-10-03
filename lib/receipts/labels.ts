// 相手・タグ（docs/分析拡充/基本設計書.md 2.4〜2.5節・3.3節）。
// 登録画面（クライアント）と Server Action の入力チェックの両方から使うため server-only にはしない。

// member＝グループのメンバー、default＝既定の相手（ふたり・友人・実家）、custom＝任意で追加した相手
export type CounterpartKind = "member" | "default" | "custom";

export type Counterpart = {
  id: number;
  kind: CounterpartKind;
  // メンバーの相手のユーザー（既定・任意の相手は null）
  userId: string | null;
  // メンバーの相手は、グループのメンバーの表示名
  name: string;
  isHidden: boolean;
};

export type Tag = {
  id: number;
  name: string;
  // 使われているタグは削除できないため、選択肢から外したいときは非表示にする
  isHidden: boolean;
};

// 登録・編集画面のプルダウンでの相手の表示。ログイン中のユーザー自身は「自分（A）」と表示する
// （要件定義書 4.2節。保存する値は変わらず、一覧・詳細では「A」と表示する）。
export function counterpartOptionLabel(
  counterpart: Counterpart,
  currentUserId: string | undefined
): string {
  const label =
    counterpart.kind === "member" && counterpart.userId === currentUserId
      ? `自分（${counterpart.name}）`
      : counterpart.name;
  return counterpart.isHidden ? `${label}（非表示）` : label;
}

// 選択肢に出す相手・タグ。表示中のものに加え、編集時に非表示のものが選ばれていればそれも残す。
export function selectableOptions<T extends { id: number; isHidden: boolean }>(
  options: T[],
  selectedIds: string[]
): T[] {
  return options.filter((o) => !o.isHidden || selectedIds.includes(String(o.id)));
}

// 明細の相手が、グループの相手として正しいか（非表示の相手も、既存の値としては正しい）
export function isKnownCounterpart(counterpartId: string, counterparts: Counterpart[]): boolean {
  return counterparts.some((c) => String(c.id) === counterpartId);
}

// 明細のタグが、すべてグループのタグか
export function areKnownTags(tagIds: string[], tags: Tag[]): boolean {
  return tagIds.every((id) => tags.some((t) => String(t.id) === id));
}
