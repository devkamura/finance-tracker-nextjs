-- 相方分レシートの同時登録（複製登録）機能で作られたレシートかどうかを保持する。
-- 一覧・詳細画面で「複製」アイコンを表示し、相方に内容確認を促すために使う。
-- 複製元との紐付けは持たない（登録後は2件を独立したレシートとして扱う）。
-- 既存レシートはすべて通常登録扱い（false）となる。

alter table public.receipts
  add column is_duplicated boolean not null default false;
