-- 明細ごとの特別費フラグ（Issue #41。docs/仕様書/#41_…/詳細設計書.md 2章）。
-- 旅行など、ふだんは発生しない支出を分析の集計から除けるようにするために使う。
-- 精算には今までどおり含める（精算の計算・RPC はこの列を見ない）。
-- 既存の明細はすべて通常（false）となる。確定済みの月の書き込み禁止（RLS）はそのまま効く。

alter table public.receipt_details
  add column is_special_expense boolean not null default false;
