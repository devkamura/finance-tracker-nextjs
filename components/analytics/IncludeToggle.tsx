"use client";

type IncludeToggleProps = {
  label: string; // 「特別費を含める」「投資を含める」
  checked: boolean; // 利用者が選んだ値
  // 絞り込み・分けるでその項目を選んでいるか。選んでいる間は ON の表示で押せなくする
  forced: boolean;
  onChange: (value: boolean) => void;
};

// 分析画面の「〇〇を含める」チェックボックス（特別費：Issue #41、投資：Issue #49）。
// 「共同を含める（1/2）」と同じ見た目にする。
export function IncludeToggle({ label, checked, forced, onChange }: IncludeToggleProps) {
  return (
    <label className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
      <input
        type="checkbox"
        checked={checked || forced}
        disabled={forced}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      {label}
      {forced && <span className="text-xs text-slate-400">（絞り込み・分けるで選択中）</span>}
    </label>
  );
}
