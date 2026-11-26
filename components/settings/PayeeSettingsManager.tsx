"use client";

import { useState, useTransition } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faUser,
  faUsers,
  faEyeSlash,
  faPen,
  faPlus,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import { Select } from "@/components/ui/Select";
import {
  addPayeeAlias,
  createPayee,
  deletePayee,
  deletePayeeAlias,
  resetOwnPayeeDefaults,
  setOwnPayeeDefaults,
  setPayeeHidden,
  updatePayee,
  updatePayeeCommonDefaults,
} from "@/lib/actions/settings/payees";
import { OWNER_JOINT_VALUE, REGISTRANT_LABEL, REGISTRANT_VALUE } from "@/lib/constants";
import {
  autoBreakdownIdFor,
  type CategoryBreakdown,
} from "@/lib/receipts/breakdowns";
import {
  counterpartOptionLabel,
  selectableOptions,
  type Counterpart,
  type Tag,
} from "@/lib/receipts/labels";
import {
  describePayeeDefaults,
  EMPTY_PAYEE_DEFAULTS,
  isPayeeHiddenFor,
  DEFAULT_PAYEE_LIST_FILTER,
  filterPayees,
  ownPayeeDefaults,
  payeeDefaultsFor,
  resolveRegistrantDefaults,
  type PayeeListFilter,
  type Payee,
  type PayeeAlias,
  type PayeeDefaults,
} from "@/lib/receipts/payees";
import type { GroupMemberOption } from "@/types/receipt";

type PayeeSettingsManagerProps = {
  initialPayees: Payee[];
  // 登録済みのレシートで使われている支払い先（削除できないため、ゴミ箱を非活性にする）
  usedPayeeIds: number[];
  categories: { id: number; name: string }[];
  breakdowns: CategoryBreakdown[];
  counterparts: Counterpart[];
  tags: Tag[];
  members: GroupMemberOption[];
  currentUserId: string;
};

// 編集中の内容。id が null なら追加。
// 追加のときの defaults は共通の既定値。編集のときは自分用の既定値で、own が false なら共通の既定値を使う
// （共通の既定値は登録後に変更しない）。
type Draft = {
  id: number | null;
  name: string;
  defaults: PayeeDefaults;
  own: boolean;
};

// 一覧の絞り込みの切り替えボタン（選んでいるものを塗りつぶす）
function FilterButtons<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`px-2.5 py-1 text-xs transition ${
                selected
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 既定値が自分用か共通かを示すバッジ。色とアイコンで見分けられるようにする
// （自分用＝藍色・1人のアイコン、共通＝灰色・複数人のアイコン）。
function DefaultsKindBadge({ own }: { own: boolean }) {
  return own ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
      <FontAwesomeIcon icon={faUser} className="text-[10px]" />
      自分用
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <FontAwesomeIcon icon={faUsers} className="text-[10px]" />
      共通
    </span>
  );
}

// 既定値が同じか（タグは並び順を問わない）
function sameDefaults(a: PayeeDefaults, b: PayeeDefaults): boolean {
  const sortedTags = (d: PayeeDefaults) => [...d.tagIds].sort().join(",");
  return (
    a.categoryId === b.categoryId &&
    a.breakdownId === b.breakdownId &&
    a.counterpartId === b.counterpartId &&
    a.ownerUserId === b.ownerUserId &&
    a.itemName.trim() === b.itemName.trim() &&
    sortedTags(a) === sortedTags(b)
  );
}

// 設定 ＞ 支払い先（docs/requirements.md「追加機能：支払い先の一本化」）。
// グループの支払い先を1つの一覧で表示し、名前と既定値（カテゴリ・内訳・相手・帰属先・タグ）、
// 別名（手入力・画像読み取りの店名をこの支払い先に寄せる。要件定義書 4.7節）を設定する。
// 登録・名前の変更・削除はメンバー全員ができる。既定値は、登録したときの内容が共通になり
// （登録後もメンバー全員が変更できる）、各メンバーが自分用に上書きできる。表示／非表示・自分用の既定値は自分の分だけ変える。
export function PayeeSettingsManager({
  initialPayees,
  usedPayeeIds,
  categories,
  breakdowns,
  counterparts,
  tags,
  members,
  currentUserId,
}: PayeeSettingsManagerProps) {
  const [payees, setPayees] = useState(initialPayees);
  // 一覧の絞り込み（画面の中だけで行い、サーバーには問い合わせない）
  const [filter, setFilter] = useState<PayeeListFilter>(
    DEFAULT_PAYEE_LIST_FILTER,
  );
  // 別名の追加で過去のレシートが紐づくと使用中になるため、画面の中でも持つ
  const [usedIds, setUsedIds] = useState(() => new Set(usedPayeeIds));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  // エラーを出す支払い先（一覧の行の操作＝非表示・削除のとき）。null なら編集欄の中か一覧の下に出す
  const [errorPayeeId, setErrorPayeeId] = useState<number | null>(null);
  // 別名を追加したときの結果（過去のレシートを何件切り替えたか）
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 相方が非表示にしている支払い先は、その旨を一覧に出す（相方の分は切り替えられない）
  const partnersHiding = (payee: Payee) =>
    members.filter(
      (m) => m.userId !== currentUserId && isPayeeHiddenFor(payee, m.userId),
    );

  // 相方が自分用の既定値を持っている支払い先は、その旨を一覧に出す（相方の分は変えられない）
  const partnersWithOwnDefaults = (payee: Payee) =>
    members.filter(
      (m) =>
        m.userId !== currentUserId &&
        ownPayeeDefaults(payee, m.userId) !== null,
    );

  const sortByName = (list: Payee[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  // targetPayeeId を渡すと、エラーをその支払い先の行のすぐ下に出す（一覧の下だと画面の外になるため）
  const run = (
    action: () => Promise<string | null>,
    targetPayeeId: number | null = null,
  ) => {
    setNotice(null);
    setErrorPayeeId(targetPayeeId);
    startTransition(async () => {
      setError(await action());
    });
  };

  // 編集欄を閉じる（キャンセル）。編集欄の中に出していたメッセージも消す
  const closeEditor = () => {
    setDraft(null);
    setError(null);
    setErrorPayeeId(null);
    setNotice(null);
  };

  const sortAliases = (list: PayeeAlias[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  // 別名の追加・削除は、支払い先の「保存」を待たずにその場で反映する
  // （追加と同時に過去のレシートを切り替えるため）
  const addAlias = (payee: Payee, name: string, onAdded: () => void) =>
    run(async () => {
      const result = await addPayeeAlias(payee.id, name);
      if (!result.success) return result.error;
      setPayees((prev) =>
        prev.map((p) =>
          p.id === payee.id
            ? { ...p, aliases: sortAliases([...p.aliases, result.alias]) }
            : p,
        ),
      );
      if (result.converted > 0) {
        setUsedIds((prev) => new Set(prev).add(payee.id));
      }
      setNotice(
        result.converted > 0
          ? `別名「${result.alias.name}」を登録し、過去のレシート${result.converted}件を「${payee.name}」に切り替えました。`
          : `別名「${result.alias.name}」を登録しました。`,
      );
      onAdded();
      return null;
    });

  const removeAlias = (payee: Payee, alias: PayeeAlias) =>
    run(async () => {
      const result = await deletePayeeAlias(payee.id, alias.id);
      if (!result.success) return result.error;
      setPayees((prev) =>
        prev.map((p) =>
          p.id === payee.id
            ? { ...p, aliases: p.aliases.filter((a) => a.id !== alias.id) }
            : p,
        ),
      );
      return null;
    });

  // 追加：入力した既定値が共通の既定値になる
  const createNew = (target: Draft) =>
    createPayee({ name: target.name, defaults: target.defaults });

  // 編集：名前が変わっていれば変更し、既定値は自分用を保存する（own が false なら自分用を消して共通に戻す）。
  // 途中で失敗したら、それまでに保存した内容を一覧に反映してからエラーを返す。
  const saveExisting = async (target: Draft & { id: number }) => {
    const before = payees.find((p) => p.id === target.id);
    const steps: (() => ReturnType<typeof updatePayee>)[] = [];
    if (!before || target.name.trim() !== before.name) {
      steps.push(() => updatePayee(target.id, { name: target.name }));
    }
    if (target.own) {
      steps.push(() => setOwnPayeeDefaults(target.id, target.defaults));
    } else {
      if (before && ownPayeeDefaults(before, currentUserId) !== null) {
        steps.push(() => resetOwnPayeeDefaults(target.id));
      }
      // 共通の既定値を変えたときだけ保存する
      if (before && !sameDefaults(target.defaults, before.defaults)) {
        steps.push(() => updatePayeeCommonDefaults(target.id, target.defaults));
      }
    }
    let latest: Payee | undefined = before;
    for (const step of steps) {
      const result = await step();
      if (!result.success) {
        if (latest) {
          const updated = latest;
          setPayees((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          );
        }
        return result;
      }
      latest = result.payee;
    }
    return latest
      ? ({ success: true, payee: latest } as const)
      : ({ success: false, error: "支払い先が見つかりません。" } as const);
  };

  const save = () =>
    run(async () => {
      if (!draft) return null;
      const saved =
        draft.id === null
          ? await createNew(draft)
          : await saveExisting({ ...draft, id: draft.id });
      if (!saved.success) return saved.error;
      setPayees((prev) =>
        sortByName([
          ...prev.filter((p) => p.id !== saved.payee.id),
          saved.payee,
        ]),
      );
      setDraft(null);
      return null;
    });

  // 自分の表示／非表示を切り替える（相方のプルダウンには影響しない）
  const toggleHidden = (payee: Payee) =>
    run(async () => {
      const result = await setPayeeHidden(
        payee.id,
        !isPayeeHiddenFor(payee, currentUserId),
      );
      if (!result.success) return result.error;
      setPayees((prev) =>
        prev.map((p) => (p.id === payee.id ? result.payee : p)),
      );
      return null;
    }, payee.id);

  const remove = (payee: Payee) =>
    run(async () => {
      const result = await deletePayee(payee.id);
      if (!result.success) return result.error;
      setPayees((prev) => prev.filter((p) => p.id !== payee.id));
      return null;
    }, payee.id);

  const context = { categories, breakdowns, counterparts, tags, members };

  // 絞り込んだ一覧。編集中の支払い先は、保存で条件から外れても編集欄を閉じるまで出しておく
  const filteredIds = new Set(
    filterPayees(payees, filter, currentUserId).map((p) => p.id),
  );
  const visiblePayees = payees.filter(
    (p) => filteredIds.has(p.id) || p.id === draft?.id,
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
        {payees.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 pb-3">
            <FilterButtons
              label="表示"
              value={filter.visibility}
              options={[
                { value: "visible", label: "表示中" },
                { value: "hidden", label: "非表示" },
                { value: "all", label: "すべて" },
              ]}
              onChange={(visibility) =>
                setFilter((prev) => ({ ...prev, visibility }))
              }
            />
            <FilterButtons
              label="既定値"
              value={filter.defaultsKind}
              options={[
                { value: "all", label: "すべて" },
                { value: "own", label: "自分用" },
                { value: "common", label: "共通" },
              ]}
              onChange={(defaultsKind) =>
                setFilter((prev) => ({ ...prev, defaultsKind }))
              }
            />
            <span className="ml-auto text-xs text-slate-400" aria-live="polite">
              {visiblePayees.length}件／全{payees.length}件
            </span>
          </div>
        )}
        {payees.length === 0 ? (
          <p className="text-xs text-slate-400">支払い先なし</p>
        ) : visiblePayees.length === 0 ? (
          <p className="text-xs text-slate-400">
            条件に合う支払い先はありません。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {visiblePayees.map((payee) => {
              const hidden = isPayeeHiddenFor(payee, currentUserId);
              const hidingPartners = partnersHiding(payee);
              const ownDefaults = ownPayeeDefaults(payee, currentUserId);
              const partnersOwn = partnersWithOwnDefaults(payee);
              return draft?.id === payee.id ? (
                <li key={payee.id} className="py-2">
                  <PayeeEditor
                    draft={draft}
                    onChange={setDraft}
                    onSave={save}
                    onCancel={closeEditor}
                    isPending={isPending}
                    currentUserId={currentUserId}
                    error={error}
                    notice={notice}
                    aliases={payee.aliases}
                    commonDefaults={payee.defaults}
                    onAddAlias={(name, onAdded) =>
                      addAlias(payee, name, onAdded)
                    }
                    onDeleteAlias={(alias) => removeAlias(payee, alias)}
                    {...context}
                  />
                </li>
              ) : (
                <li key={payee.id} className="flex flex-col gap-1 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span
                          className={`text-sm ${hidden ? "text-slate-400 line-through" : "text-slate-800"}`}
                        >
                          {payee.name}
                          {hidden && (
                            <span className="ml-2 text-xs no-underline">
                              （非表示）
                            </span>
                          )}
                        </span>
                        {/* ゴミ箱が押せない理由を、マウスを乗せなくても（スマホでも）わかるように出す */}
                        {usedIds.has(payee.id) && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                            使用中
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <DefaultsKindBadge own={ownDefaults !== null} />
                        <span
                          className={
                            ownDefaults ? "text-indigo-700" : undefined
                          }
                        >
                          {describePayeeDefaults(
                            payeeDefaultsFor(payee, currentUserId),
                            context,
                          )}
                        </span>
                      </span>
                      {/* 自分用にしているときも、共通に戻すかを判断できるよう共通の既定値を出す */}
                      {ownDefaults && (
                        <span className="flex items-center gap-1.5 pl-1 text-xs text-slate-400">
                          <FontAwesomeIcon
                            icon={faUsers}
                            className="text-[10px]"
                          />
                          共通：{describePayeeDefaults(payee.defaults, context)}
                        </span>
                      )}
                      {payee.aliases.length > 0 && (
                        <span className="text-xs text-slate-500">
                          別名：{payee.aliases.map((a) => a.name).join("、")}
                        </span>
                      )}
                      {hidingPartners.length > 0 && (
                        <span className="text-xs text-slate-400">
                          {hidingPartners.map((m) => m.displayName).join("、")}
                          さんは非表示
                        </span>
                      )}
                      {partnersOwn.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <FontAwesomeIcon
                            icon={faUser}
                            className="text-[10px]"
                          />
                          {partnersOwn.map((m) => m.displayName).join("、")}
                          さんは自分用
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({
                            id: payee.id,
                            name: payee.name,
                            defaults: ownDefaults ?? payee.defaults,
                            own: ownDefaults !== null,
                          });
                          setError(null);
                          setErrorPayeeId(null);
                          setNotice(null);
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
                        aria-label={
                          hidden
                            ? "自分のプルダウンに表示する"
                            : "自分のプルダウンで非表示にする"
                        }
                        title={
                          hidden
                            ? "自分のプルダウンに表示する"
                            : "自分のプルダウンで非表示にする"
                        }
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <FontAwesomeIcon icon={hidden ? faEye : faEyeSlash} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(payee)}
                        disabled={isPending || usedIds.has(payee.id)}
                        aria-label={
                          usedIds.has(payee.id)
                            ? "削除（使用中のため削除できません）"
                            : "削除"
                        }
                        title={
                          usedIds.has(payee.id)
                            ? "レシートで使用中のため削除できません"
                            : "削除"
                        }
                        className={
                          usedIds.has(payee.id)
                            ? "cursor-not-allowed text-slate-300"
                            : "text-red-400 hover:text-red-600"
                        }
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>
                  {errorPayeeId === payee.id && error && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {draft?.id === null ? (
          <PayeeEditor
            draft={draft}
            onChange={setDraft}
            onSave={save}
            onCancel={closeEditor}
            isPending={isPending}
            currentUserId={currentUserId}
            error={error}
            notice={notice}
            {...context}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft({
                id: null,
                name: "",
                defaults: EMPTY_PAYEE_DEFAULTS,
                own: false,
              });
              setError(null);
              setErrorPayeeId(null);
              setNotice(null);
            }}
            disabled={isPending}
            className="flex items-center gap-1 self-start rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faPlus} className="text-xs" />
            支払い先を追加
          </button>
        )}

        {/* 編集欄が開いているときは、操作している場所で見えるよう編集欄の中に出す */}
        {draft === null && errorPayeeId === null && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {draft === null && notice && (
          <p className="text-sm text-emerald-700">{notice}</p>
        )}
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
  // 保存・別名の操作の結果（一覧の下だと画面の外になることがあるため、編集欄の中に出す）
  error: string | null;
  notice: string | null;
  categories: { id: number; name: string }[];
  breakdowns: CategoryBreakdown[];
  counterparts: Counterpart[];
  tags: Tag[];
  members: GroupMemberOption[];
  // 共通の既定値（編集のときだけ。「共通に戻す」で表示し直すため）
  commonDefaults?: PayeeDefaults;
  // 別名（編集のときだけ。追加のときは、支払い先を保存してから編集で登録する）
  aliases?: PayeeAlias[];
  onAddAlias?: (name: string, onAdded: () => void) => void;
  onDeleteAlias?: (alias: PayeeAlias) => void;
};

// 支払い先の名前と既定値の入力欄（追加・編集で共通）
function PayeeEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  isPending,
  currentUserId,
  error,
  notice,
  categories,
  breakdowns,
  counterparts,
  tags,
  members,
  commonDefaults,
  aliases,
  onAddAlias,
  onDeleteAlias,
}: PayeeEditorProps) {
  const { defaults } = draft;
  // 編集のときは、自分用か共通かを切り替えて編集する（共通の既定値もメンバー全員が編集できる）
  const isExisting = draft.id !== null;
  const [aliasInput, setAliasInput] = useState("");
  const submitAlias = () => {
    if (!onAddAlias || !aliasInput.trim()) return;
    onAddAlias(aliasInput, () => setAliasInput(""));
  };
  const setDefaults = (patch: Partial<PayeeDefaults>) =>
    onChange({ ...draft, defaults: { ...defaults, ...patch } });

  // 内訳は選んだカテゴリの内訳だけ（基本設計書 2.6節）。非表示の内訳は、保存済みの値のときだけ残す。
  const breakdownOptions = breakdowns.filter(
    (b) =>
      defaults.categoryId !== "" &&
      String(b.categoryId) === defaults.categoryId &&
      (!b.isHidden || String(b.id) === defaults.breakdownId),
  );
  const counterpartOptions = selectableOptions(counterparts, [
    defaults.counterpartId,
  ]);
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

      {isExisting ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-600">
            既定値
            <DefaultsKindBadge own={draft.own} />
            {/* 共通を変えると相方にも反映されるため、それだけは伝える */}
            {!draft.own && (
              <span className="font-normal text-slate-500">全員に反映</span>
            )}
          </p>
          {draft.own ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...draft,
                  own: false,
                  defaults: commonDefaults ?? EMPTY_PAYEE_DEFAULTS,
                })
              }
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              共通に戻す
            </button>
          ) : (
            <button
              type="button"
              // 共通の既定値をコピーして自分用にする。「登録する人」は自分用では選べないため、
              // 自分（相手は自分のメンバーの相手）に置き換えてコピーする（Issue #44）
              onClick={() =>
                onChange({
                  ...draft,
                  own: true,
                  defaults: resolveRegistrantDefaults(
                    defaults,
                    currentUserId,
                    counterparts,
                  ),
                })
              }
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              自分用にする
            </button>
          )}
          {/* 自分用を編集しているときも、共通の既定値（「共通に戻す」で使われる値）を見られるようにする */}
          {draft.own && commonDefaults && (
            <p className="flex w-full items-center gap-1.5 text-xs text-slate-500">
              <FontAwesomeIcon
                icon={faUsers}
                className="text-[10px] text-slate-400"
              />
              共通：
              {describePayeeDefaults(commonDefaults, {
                categories,
                breakdowns,
                counterparts,
                tags,
                members,
              })}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs font-medium text-slate-600">既定値（任意）</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="カテゴリ"
          value={defaults.categoryId}
          disabled={isPending}
          onChange={(e) =>
            // カテゴリを変えたら内訳は選び直し（内訳が1つだけなら自動で選ぶ）
            setDefaults({
              categoryId: e.target.value,
              breakdownId: e.target.value
                ? autoBreakdownIdFor(e.target.value, breakdowns)
                : "",
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
          <option value="">
            {breakdownOptions.length === 0 ? "―" : "設定しない"}
          </option>
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
          {/* 「登録する人」は共通の既定値でだけ選べる（入力するメンバー本人に置き換わる。Issue #44） */}
          {!draft.own && (
            <option value={REGISTRANT_VALUE}>{REGISTRANT_LABEL}</option>
          )}
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
          {!draft.own && (
            <option value={REGISTRANT_VALUE}>{REGISTRANT_LABEL}</option>
          )}
          <option value={OWNER_JOINT_VALUE}>共同</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </div>

      {/* 商品名は、ほかの既定値と違い、商品名が空の明細にだけ入れる（入力済みの商品名は消さない） */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">
          商品名（空の明細にだけ入ります）
        </span>
        <input
          type="text"
          value={defaults.itemName}
          onChange={(e) => setDefaults({ itemName: e.target.value })}
          disabled={isPending}
          placeholder="例：ガス代"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>

      {tagOptions.length > 0 && (
        <div>
          <span className="text-sm font-medium text-slate-700">
            タグ（複数可）
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

      {aliases && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">
            別名（この店名もこの支払い先にします）
          </span>
          {aliases.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {aliases.map((alias) => (
                <li
                  key={alias.id}
                  className="flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                >
                  {alias.name}
                  <button
                    type="button"
                    onClick={() => onDeleteAlias?.(alias)}
                    disabled={isPending}
                    aria-label={`別名「${alias.name}」を削除`}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => {
                // 支払い先のフォームの送信（保存）にならないよう、Enter は別名の追加にする
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submitAlias();
                }
              }}
              disabled={isPending}
              placeholder="別名を入力"
              aria-label="追加する別名"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={submitAlias}
              disabled={isPending || !aliasInput.trim()}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              別名を追加
            </button>
          </div>
          <span className="text-xs text-slate-500">
            登録済みのレシートも切り替わります。
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

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
