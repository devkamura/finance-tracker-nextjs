-- 分析拡充 F1：カテゴリの内訳・費用区分（docs/分析拡充/基本設計書.md 3.1〜3.2節・4章）。
-- 内訳と費用区分はグループごとに設定できるようにする（カテゴリ自体はアプリ共通のマスタのまま）。

-- ---------------------------------------------------------------------------
-- 費用区分（固定費／変動費）
-- ---------------------------------------------------------------------------

-- カテゴリごとの費用区分の初期値。グループで設定していないカテゴリはこの値を使う。
alter table public.categories
  add column default_cost_type text not null default 'variable'
  check (default_cost_type in ('fixed', 'variable'));

-- 一般的な家計の固定費にあたるカテゴリを固定費にする（基本設計書 Q5）
update public.categories
  set default_cost_type = 'fixed'
  where name in ('賃料', '水道光熱費', '通信費');

-- グループごとの費用区分。行がないカテゴリは categories.default_cost_type を使う。
create table public.category_settings (
  group_id uuid not null references public.groups (id) on delete cascade,
  category_id bigint not null references public.categories (id) on delete cascade,
  cost_type text not null check (cost_type in ('fixed', 'variable')),
  updated_at timestamptz not null default now(),
  primary key (group_id, category_id)
);

create trigger category_settings_set_updated_at
  before update on public.category_settings
  for each row
  execute function public.set_updated_at();

alter table public.category_settings enable row level security;

create policy "member can read own group category_settings"
  on public.category_settings for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

-- 編集は管理者のみ（基本設計書 4.2節・Q2）
create policy "admin can write own group category_settings"
  on public.category_settings for all
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- ---------------------------------------------------------------------------
-- 内訳（カテゴリ ＞ 内訳）
-- ---------------------------------------------------------------------------

create table public.category_breakdowns (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  category_id bigint not null references public.categories (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  -- 使われている内訳は削除できないため、選択肢から外したいときは非表示にする（基本設計書 Q4）
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 内訳の名前は同じカテゴリの中で重複できない
  constraint category_breakdowns_name_uniq unique (group_id, category_id, name)
);

create index category_breakdowns_group_category_idx
  on public.category_breakdowns (group_id, category_id);

create trigger category_breakdowns_set_updated_at
  before update on public.category_breakdowns
  for each row
  execute function public.set_updated_at();

alter table public.category_breakdowns enable row level security;

create policy "member can read own group category_breakdowns"
  on public.category_breakdowns for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

create policy "admin can write own group category_breakdowns"
  on public.category_breakdowns for all
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- ---------------------------------------------------------------------------
-- 明細の内訳
-- ---------------------------------------------------------------------------

-- 既存の明細は「内訳なし」（null）のまま。使われている内訳は削除できない（on delete restrict）。
alter table public.receipt_details
  add column breakdown_id bigint references public.category_breakdowns (id) on delete restrict;

create index receipt_details_breakdown_id_idx on public.receipt_details (breakdown_id);

-- 明細の内訳が、明細のカテゴリ・レシートのグループの内訳であることをDBでも保証する
-- （画面・Server Actionでも検証するが、不整合なデータを入れられないようにする）。
create or replace function public.check_receipt_detail_breakdown()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.breakdown_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.category_breakdowns b
    join public.receipts r on r.id = new.receipt_id
    where b.id = new.breakdown_id
      and b.category_id = new.category_id
      and b.group_id = r.group_id
  ) then
    raise exception 'breakdown does not belong to the category of this detail';
  end if;
  return new;
end;
$$;

create trigger receipt_details_check_breakdown
  before insert or update of breakdown_id, category_id on public.receipt_details
  for each row
  execute function public.check_receipt_detail_breakdown();
