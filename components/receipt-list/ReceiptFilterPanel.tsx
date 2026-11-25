"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faFilter, faXmark } from "@fortawesome/free-solid-svg-icons";

import { monthDateRange, type UserBasis, type UserSelection } from "@/lib/receipts/list-search";

type ReceiptFilterPanelProps = {
  members: { userId: string; displayName: string }[];
  month: string; // "YYYY-MM"。期間はこの月の中で選ぶ
  user: UserSelection;
  startDate: string; // "YYYY-MM-DD" または ""（指定なし）
  endDate: string;
  keyword: string;
  activeCount: number; // 使っている条件の数（閉じているときに出す）
  onChangeUser: (selection: UserSelection) => void;
  onChangePeriod: (period: { start: string; end: string }) => void;
  onChangeKeyword: (keyword: string) => void;
  onClear: () => void; // 分析画面から渡された条件も含めて、すべて外す
};

const inputClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none";

const BASIS_OPTIONS: { value: UserBasis; label: string }[] = [
  { value: "payer", label: "支払者" },
  { value: "burden", label: "負担者" },
];

// レシート一覧のフィルタ欄（Issue #39）。ユーザー・期間・キーワードで絞り込む。
// 一覧が画面の下に押し出されないよう最初は閉じておき、使っている条件の数だけを見せる
// （分析画面の条件の折りたたみと同じ考え方。開閉は画面の中だけで、URLには残さない）。
// 絞り込み自体は画面側だけで行う（サーバー通信なし）。
export function ReceiptFilterPanel({
  members,
  month,
  user,
  startDate,
  endDate,
  keyword,
  activeCount,
  onChangeUser,
  onChangePeriod,
  onChangeKeyword,
  onClear,
}: ReceiptFilterPanelProps) {
  const [open, setOpen] = useState(false);
  const range = monthDateRange(month);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
      >
        <FontAwesomeIcon icon={faFilter} className="shrink-0 text-xs text-slate-400" />
        <span className="flex-1 font-medium text-slate-700">絞り込み</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
            {activeCount}
          </span>
        )}
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-slate-100 px-3 pb-3 pt-3">
          {/* ユーザー：全員／メンバーと、基準（支払者／負担者） */}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-slate-500">ユーザー</legend>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="ユーザー"
                value={user.userId ?? ""}
                onChange={(e) => onChangeUser({ ...user, userId: e.target.value || null })}
                className={inputClass}
              >
                <option value="">全員</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              <div className="flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="基準">
                {BASIS_OPTIONS.map((option) => {
                  const selected = user.basis === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChangeUser({ ...user, basis: option.value })}
                      className={`px-3 py-1.5 text-sm ${
                        selected
                          ? "bg-slate-700 font-bold text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {user.basis === "burden" && user.userId && (
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={user.includeJoint}
                  onChange={(e) => onChangeUser({ ...user, includeJoint: e.target.checked })}
                  className="h-4 w-4"
                />
                共同1/2を含む
              </label>
            )}
          </fieldset>

          {/* 期間：選んでいる月の中で開始日〜終了日（片方だけでもよい） */}
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-medium text-slate-500">期間</legend>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="開始日"
                value={startDate}
                min={range.min}
                max={range.max}
                onChange={(e) => onChangePeriod({ start: e.target.value, end: endDate })}
                className={inputClass}
              />
              <span className="text-sm text-slate-500">〜</span>
              <input
                type="date"
                aria-label="終了日"
                value={endDate}
                min={range.min}
                max={range.max}
                onChange={(e) => onChangePeriod({ start: startDate, end: e.target.value })}
                className={inputClass}
              />
              {/* 日付の入力欄は1つずつしか消せないため、開始日・終了日をまとめて外すボタンを置く */}
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => onChangePeriod({ start: "", end: "" })}
                  aria-label="期間をクリア"
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <FontAwesomeIcon icon={faXmark} />
                  クリア
                </button>
              )}
            </div>
          </fieldset>

          {/* キーワード：支払い先名・商品名の部分一致 */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">キーワード</span>
            <input
              type="search"
              value={keyword}
              placeholder="支払い先名・商品名"
              onChange={(e) => onChangeKeyword(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              条件をクリア
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
