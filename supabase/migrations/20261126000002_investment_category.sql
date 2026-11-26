-- 分析で投資を見分けられるようにする（Issue #49。docs/仕様書/#49_…/要件定義書.md）。
--   1. カテゴリ「投資」「保険料」を追加する（費用区分の初期値はどちらも固定費）
--   2. 内訳ごとに費用区分を持たせる（必須。既存の内訳には今のカテゴリの費用区分を入れる。
--      新しく作る内訳で指定がなければ、そのときのカテゴリの費用区分を入れる）
--   3. 各グループに、カテゴリ「投資」の内訳「積立（NISA）」（固定費）・「個別株」（変動費）を作る
--   4. タグ「投資」が付いた明細を、カテゴリ「投資」＞内訳「積立（NISA）」に付け替える
-- 精算の計算は変えない（明細の金額・帰属先は変えない）。

-- ---------------------------------------------------------------------------
-- 1. カテゴリ
-- ---------------------------------------------------------------------------

insert into public.categories (name, default_cost_type) values
  ('投資', 'fixed'),
  ('保険料', 'fixed')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. 内訳の費用区分
-- ---------------------------------------------------------------------------

-- 内訳は必ず固定費か変動費を持つ。カテゴリの費用区分を後で変えても、内訳の区分は変わらない
-- （カテゴリに合わせて変わる仕組みは持たない）。明細には保存せず、集計するときの設定で決める。
alter table public.category_breakdowns
  add column cost_type text check (cost_type in ('fixed', 'variable'));

-- 既存の内訳には、今のカテゴリの費用区分（グループの設定 → カテゴリの初期値）を入れる
update public.category_breakdowns b
set cost_type = coalesce(
  (select cs.cost_type from public.category_settings cs
   where cs.group_id = b.group_id and cs.category_id = b.category_id),
  (select c.default_cost_type from public.categories c where c.id = b.category_id)
)
where b.cost_type is null;

-- 新しく作る内訳で費用区分の指定がなければ、そのときのカテゴリの費用区分を入れる。
-- アプリ・テストデータの SQL など、内訳を作るどの経路でも漏れなく入るよう DB で行う。
create or replace function public.fill_breakdown_cost_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cost_type is null then
    select coalesce(
      (select cs.cost_type from public.category_settings cs
       where cs.group_id = new.group_id and cs.category_id = new.category_id),
      (select c.default_cost_type from public.categories c where c.id = new.category_id)
    ) into new.cost_type;
  end if;
  return new;
end;
$$;

create trigger category_breakdowns_fill_cost_type
  before insert on public.category_breakdowns
  for each row
  execute function public.fill_breakdown_cost_type();

-- ---------------------------------------------------------------------------
-- 3. 投資の内訳
-- ---------------------------------------------------------------------------

-- 既にあるグループに作る（これから作るグループは、設定 ＞ カテゴリから作る）。
-- 同じ名前の内訳がすでにあれば作らない。
insert into public.category_breakdowns (group_id, category_id, name, sort_order, cost_type)
select g.id, c.id, v.name, v.sort_order, v.cost_type
from public.groups g
cross join public.categories c
cross join (values
  ('積立（NISA）', 1, 'fixed'),
  ('個別株', 2, 'variable')
) as v (name, sort_order, cost_type)
where c.name = '投資'
on conflict on constraint category_breakdowns_name_uniq do nothing;

-- すべての内訳に費用区分が入ったので、空を禁止する。
-- 列の NOT NULL ではなく CHECK 制約にするのは、作るときに省略できる（トリガーが入れる）ようにするため
-- （NOT NULL だと、生成される型で作るときに毎回費用区分を渡す必要がある）。
-- CHECK 制約は BEFORE トリガーで値が入った後に確かめられる。
alter table public.category_breakdowns
  add constraint category_breakdowns_cost_type_required check (cost_type is not null);

-- ---------------------------------------------------------------------------
-- 4. タグ「投資」の明細の付け替え
-- ---------------------------------------------------------------------------

-- 精算確定済みの月の明細も付け替える（金額・帰属先は変わらないため、精算の結果は変わらない）。
-- 相手・タグ・特別費は変えない。
update public.receipt_details d
set category_id = c.id,
    breakdown_id = b.id
from public.receipts r,
     public.categories c,
     public.category_breakdowns b
where r.id = d.receipt_id
  and c.name = '投資'
  and b.group_id = r.group_id
  and b.category_id = c.id
  and b.name = '積立（NISA）'
  and exists (
    select 1
    from public.receipt_detail_tags dt
    join public.tags t on t.id = dt.tag_id
    where dt.receipt_detail_id = d.id
      and t.group_id = r.group_id
      and t.name = '投資'
  );
