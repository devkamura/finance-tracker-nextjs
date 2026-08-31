type BadgeProps = {
  label?: string;
  value: string;
};

// 「カテゴリ: 食費」のように項目名を明示した小さなバッジ。
// 明細の各属性（カテゴリ・目的・帰属先・税区分等）を並べる際に、
// スラッシュ区切りの生値だけでは何の項目か分からない問題を解消するために使う。
export function Badge({ label, value }: BadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
      {label && <span className="text-slate-400">{label}</span>}
      <span className="font-medium text-slate-700">{value}</span>
    </span>
  );
}
