"use client";

type SpecialExpenseToggleProps = {
  checked: boolean; // 利用者が選んだ「特別費を含める」
  // 絞り込み・分けるで特別費の項目を選んでいるか。選んでいる間は ON の表示で押せなくする
  forced: boolean;
  onChange: (value: boolean) => void;
};

// 分析画面の「特別費を含める」チェックボックス（Issue #41。docs/仕様書/#41_…/詳細設計書.md 6.4節）。
// 「共同を含める（1/2）」と同じ見た目にする。初期値は OFF（特別費を除く）。
export function SpecialExpenseToggle({ checked, forced, onChange }: SpecialExpenseToggleProps) {
  return (
    <label className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
      <input
        type="checkbox"
        checked={checked || forced}
        disabled={forced}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      特別費を含める
      {forced && <span className="text-xs text-slate-400">（絞り込み・分けるで選択中）</span>}
    </label>
  );
}
