"use client";

import { useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faEyeSlash,
  faPen,
  faPlus,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import { Select } from "@/components/ui/Select";
import { createPayee, deletePayee, updatePayee } from "@/lib/actions/settings/payees";
import { OWNER_JOINT_VALUE } from "@/lib/constants";
import { autoBreakdownIdFor, type CategoryBreakdown } from "@/lib/receipts/breakdowns";
import {
  counterpartOptionLabel,
  selectableOptions,
  type Counterpart,
  type Tag,
} from "@/lib/receipts/labels";
import {
  describePayeeDefaults,
  EMPTY_PAYEE_DEFAULTS,
  type Payee,
  type PayeeDefaults,
} from "@/lib/receipts/payees";
import type { GroupMemberOption } from "@/types/receipt";

type PayeeSettingsManagerProps = {
  initialPayees: Payee[];
  categories: { id: number; name: string }[];
  breakdowns: CategoryBreakdown[];
  counterparts: Counterpart[];
  tags: Tag[];
  members: GroupMemberOption[];
  currentUserId: string;
  isAdmin: boolean;
};

// 一覧の切り替え。"shared"＝グループ全体、それ以外はユーザーID（自分用・相方用）
type ListKey = "shared" | string;

// 編集中の内容。id が null なら追加
type Draft = { id: number | null; name: string; defaults: PayeeDefaults };

// 設定 ＞ 支払い先（docs/分析拡充/基本設計書.md 2.6節）。
// グループ全体／自分用／相方用（閲覧のみ）に分けて表示し、名前と既定値（カテゴリ・内訳・相手・帰属先）を設定する。
// グループ全体は管理者のみ、自分用は本人のみ編集できる。
export function PayeeSettingsManager({
  initialPayees,
  categories,
  breakdowns,
  counterparts,
  tags,
  members,
  currentUserId,
  isAdmin,
}: PayeeSettingsManagerProps) {
  const [payees, setPayees] = useState(initialPayees);
  const [listKey, setListKey] = useState<ListKey>("shared");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const partners = members.filter((m) => m.userId !== currentUserId);
  const lists: { key: ListKey; label: string }[] = [
    { key: "shared", label: "グループ全体" },
    { key: currentUserId, label: "自分用" },
    ...partners.map((m) => ({ key: m.userId, label: `${m.displayName}さん用（閲覧のみ）` })),
  ];
  const canEdit = listKey === "shared" ? isAdmin : listKey === currentUserId;
  const visiblePayees = payees.filter((p) =>
    listKey === "shared" ? p.ownerUserId === null : p.ownerUserId === listKey
  );

  const sortByName = (list: Payee[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const run = (action: () => Promise<string | null>) => {
    startTransition(async () => {
      setError(await action());
    });
  };

  const switchList = (key: ListKey) => {
    setListKey(key);
    setDraft(null);
    setError(null);
  };

  const save = () =>
    run(async () => {
      if (!draft) return null;
      const result =
        draft.id === null
          ? await createPayee({
              scope: listKey === "shared" ? "shared" : "own",
              name: draft.name,
              defaults: draft.defaults,
            })
          : await updatePayee(draft.id, { name: draft.name, defaults: draft.defaults });
      if (!result.success) return result.error;
      setPayees((prev) =>
        sortByName([...prev.filter((p) => p.id !== result.payee.id), result.payee])
      );
      setDraft(null);
      return null;
    });

  const toggleHidden = (payee: Payee) =>
    run(async () => {
      const result = await updatePayee(payee.id, { isHidden: !payee.isHidden });
      if (!result.success) return result.error;
      setPayees((prev) => prev.map((p) => (p.id === payee.id ? result.payee : p)));
      return null;
    });

  const remove = (payee: Payee) =>
    run(async () => {
      const result = await deletePayee(payee.id);
      if (!result.success) return result.error;
      setPayees((prev) => prev.filter((p) => p.id !== payee.id));
      return null;
    });

  const context = { categories, breakdowns, counterparts, tags, members };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="支払い先の一覧">
        {lists.map((list) => (
          <button
            key={list.key}
            type="button"
            role="tab"
            aria-selected={listKey === list.key}
            onClick={() => switchList(list.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              listKey === list.key
                ? "border-indigo-600 bg-indigo-50 font-bold text-indigo-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {list.label}
          </button>
        ))}
      </div>

      {!canEdit && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          {listKey === "shared"
            ? "グループ全体の支払い先は管理者のみ編集できます。"
            : "他のメンバーの支払い先は閲覧のみです。"}
        </p>
      )}
      <p className="text-xs text-slate-500">
        レシート登録画面のプルダウンには「グループ全体」と「自分用」の支払い先が出ます。
        既定値を設定すると、登録画面で支払い先を選んだときに、すべての明細に入ります。非表示にした支払い先はプルダウンに出ません。
      </p>

      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
        {visiblePayees.length === 0 ? (
          <p className="text-xs text-slate-400">支払い先なし</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {visiblePayees.map((payee) =>
              draft?.id === payee.id ? (
                <li key={payee.id} className="py-2">
                  <PayeeEditor
                    draft={draft}
                    onChange={setDraft}
                    onSave={save}
                    onCancel={() => setDraft(null)}
                    isPending={isPending}
                    currentUserId={currentUserId}
                    {...context}
                  />
                </li>
              ) : (
                <li key={payee.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex min-w-0 flex-col">
                    <span
                      className={`text-sm ${payee.isHidden ? "text-slate-400 line-through" : "text-slate-800"}`}
                    >
                      {payee.name}
                      {payee.isHidden && <span className="ml-2 text-xs no-underline">（非表示）</span>}
                    </span>
                    <span className="text-xs text-slate-500">
                      既定値：{describePayeeDefaults(payee.defaults, context)}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({ id: payee.id, name: payee.name, defaults: payee.defaults });
                          setError(null);
                        }}
                        disabled={isPending}
                        aria-label="編集"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleHidden(payee)}
                        disabled={isPending}
                        aria-label={payee.isHidden ? "表示する" : "非表示にする"}
                        title={payee.isHidden ? "表示する" : "非表示にする"}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <FontAwesomeIcon icon={payee.isHidden ? faEye : faEyeSlash} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(payee)}
                        disabled={isPending}
                        aria-label="削除"
                        className="text-red-400 hover:text-red-600"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  )}
                </li>
              )
            )}
          </ul>
        )}

        {canEdit &&
          (draft?.id === null ? (
            <PayeeEditor
              draft={draft}
              onChange={setDraft}
              onSave={save}
              onCancel={() => setDraft(null)}
              isPending={isPending}
              currentUserId={currentUserId}
              {...context}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft({ id: null, name: "", defaults: EMPTY_PAYEE_DEFAULTS });
                setError(null);
              }}
              disabled={isPending}
              className="flex items-center gap-1 self-start rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faPlus} className="text-xs" />
              支払い先を追加
            </button>
          ))}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}

type PayeeEditorProps = {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
  currentUserId: string;
  categories: { id: number; name: string }[];
  breakdowns: CategoryBreakdown[];
  counterparts: Counterpart[];
  tags: Tag[];
  members: GroupMemberOption[];
};

// 支払い先の名前と既定値の入力欄（追加・編集で共通）
function PayeeEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  isPending,
  currentUserId,
  categories,
  breakdowns,
  counterparts,
  tags,
  members,
}: PayeeEditorProps) {
  const { defaults } = draft;
  const setDefaults = (patch: Partial<PayeeDefaults>) =>
    onChange({ ...draft, defaults: { ...defaults, ...patch } });

  // 内訳は選んだカテゴリの内訳だけ（基本設計書 2.6節）。非表示の内訳は、保存済みの値のときだけ残す。
  const breakdownOptions = breakdowns.filter(
    (b) =>
      defaults.categoryId !== "" &&
      String(b.categoryId) === defaults.categoryId &&
      (!b.isHidden || String(b.id) === defaults.breakdownId)
  );
  const counterpartOptions = selectableOptions(counterparts, [defaults.counterpartId]);
  const tagOptions = selectableOptions(tags, defaults.tagIds);
  const toggleTag = (tagId: string) =>
    setDefaults({
      tagIds: defaults.tagIds.includes(tagId)
        ? defaults.tagIds.filter((id) => id !== tagId)
        : [...defaults.tagIds, tagId],
    });

  return (
    <form
      className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">名前</span>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          disabled={isPending}
          autoFocus
          placeholder="支払い先名を入力"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>

      <p className="text-xs font-medium text-slate-600">既定値（任意）</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="カテゴリ"
          value={defaults.categoryId}
          disabled={isPending}
          onChange={(e) =>
            // カテゴリを変えたら内訳は選び直し（内訳が1つだけなら自動で選ぶ）
            setDefaults({
              categoryId: e.target.value,
              breakdownId: e.target.value ? autoBreakdownIdFor(e.target.value, breakdowns) : "",
            })
          }
        >
          <option value="">設定しない</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select
          label="内訳"
          value={defaults.breakdownId}
          disabled={isPending || breakdownOptions.length === 0}
          onChange={(e) => setDefaults({ breakdownId: e.target.value })}
        >
          <option value="">{breakdownOptions.length === 0 ? "―" : "設定しない"}</option>
          {breakdownOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.isHidden ? `${b.name}（非表示）` : b.name}
            </option>
          ))}
        </Select>

        <Select
          label="相手"
          value={defaults.counterpartId}
          disabled={isPending}
          onChange={(e) => setDefaults({ counterpartId: e.target.value })}
        >
          <option value="">設定しない</option>
          {counterpartOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {counterpartOptionLabel(c, currentUserId)}
            </option>
          ))}
        </Select>

        <Select
          label="帰属先"
          value={defaults.ownerUserId}
          disabled={isPending}
          onChange={(e) => setDefaults({ ownerUserId: e.target.value })}
        >
          <option value="">設定しない</option>
          <option value={OWNER_JOINT_VALUE}>共同</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </div>

      {tagOptions.length > 0 && (
        <div>
          <span className="text-sm font-medium text-slate-700">
            タグ（任意・複数選択可。支払い先を選ぶと明細のタグをこれに置き換えます）
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {tagOptions.map((tag) => {
              const checked = defaults.tagIds.includes(String(tag.id));
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={checked}
                  disabled={isPending}
                  onClick={() => toggleTag(String(tag.id))}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    checked
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tag.name}
                  {tag.isHidden ? "（非表示）" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          保存
        </button>
      </div>
    </form>
  );
}
