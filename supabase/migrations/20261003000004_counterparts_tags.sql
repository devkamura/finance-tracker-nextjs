-- 分析拡充 F2：相手・タグ（docs/分析拡充/基本設計書.md 2.4〜2.5節・3.3節・4〜5章）。
-- アプリ共通の「目的」（purposes）を、グループごとの「相手」（counterparts）に、
-- 「シーン」（scenes）を、グループごとの「タグ」（tags）に置き換える。

-- ---------------------------------------------------------------------------
-- 相手
-- ---------------------------------------------------------------------------

-- 種類：member＝グループのメンバー（名前は profiles の表示名に連動するため持たない）、
--       default＝既定の相手（ふたり・友人・実家。名前の変更・削除はできず、表示・非表示のみ）、
--       custom＝任意で追加した相手（名前の変更・削除ができる）。
create table public.counterparts (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  kind text not null check (kind in ('member', 'default', 'custom')),
  user_id uuid references auth.users (id) on delete cascade,
  name text check (name is null or length(btrim(name)) > 0),
  sort_order integer not null default 0,
  -- 非表示にした相手は登録画面の選択肢に出さない（既存の明細の表示はそのまま）
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint counterparts_kind_columns check (
    (kind = 'member' and user_id is not null and name is null)
    or (kind <> 'member' and user_id is null and name is not null)
  )
);

-- メンバーの相手はグループ×ユーザーで1つ
create unique index counterparts_member_uniq
  on public.counterparts (group_id, user_id) where kind = 'member';
-- 既定・任意の相手の名前はグループの中で重複できない
create unique index counterparts_name_uniq
  on public.counterparts (group_id, name) where kind <> 'member';

create trigger counterparts_set_updated_at
  before update on public.counterparts
  for each row
  execute function public.set_updated_at();

-- メンバー・既定の相手は、名前・種類・ユーザーを変えられない（表示・非表示と並び順のみ）。
create or replace function public.protect_builtin_counterparts()
returns trigger
language plpgsql
as $$
begin
  if old.kind <> 'custom' and (
    new.kind is distinct from old.kind
    or new.user_id is distinct from old.user_id
    or new.name is distinct from old.name
    or new.group_id is distinct from old.group_id
  ) then
    raise exception 'built-in counterparts cannot be renamed';
  end if;
  if old.kind = 'custom' and (new.kind <> 'custom' or new.group_id <> old.group_id) then
    raise exception 'custom counterparts cannot change kind or group';
  end if;
  return new;
end;
$$;

create trigger counterparts_protect_builtin
  before update on public.counterparts
  for each row
  execute function public.protect_builtin_counterparts();

alter table public.counterparts enable row level security;

create policy "member can read own group counterparts"
  on public.counterparts for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

-- 編集は管理者のみ（基本設計書 4.2節）。追加・削除できるのは任意の相手だけ
-- （メンバー・既定の相手はトリガーで自動作成する）。
create policy "admin can insert own group custom counterparts"
  on public.counterparts for insert
  to authenticated
  with check (public.is_group_admin(group_id) and kind = 'custom');

create policy "admin can update own group counterparts"
  on public.counterparts for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy "admin can delete own group custom counterparts"
  on public.counterparts for delete
  to authenticated
  using (public.is_group_admin(group_id) and kind = 'custom');

-- 既定の相手（ふたり・友人・実家）を作る。グループ作成時と、既存グループの移し替えで使う。
create or replace function public.create_default_counterparts(p_group_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.counterparts (group_id, kind, name, sort_order)
  values
    (p_group_id, 'default', 'ふたり', 1),
    (p_group_id, 'default', '友人', 2),
    (p_group_id, 'default', '実家', 3)
  on conflict do nothing;
$$;

revoke all on function public.create_default_counterparts(uuid) from public;

create or replace function public.handle_new_group_counterparts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.create_default_counterparts(new.id);
  return new;
end;
$$;

create trigger groups_create_default_counterparts
  after insert on public.groups
  for each row
  execute function public.handle_new_group_counterparts();

-- メンバーの相手を作る。招待中（user_id が null）の行は、参加して user_id が入った時点で作る。
-- 除籍後に再参加した場合は、以前の相手をそのまま使う（on conflict do nothing）。
create or replace function public.handle_group_member_counterpart()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.user_id is not null then
    insert into public.counterparts (group_id, kind, user_id, sort_order)
    values (new.group_id, 'member', new.user_id, 0)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger group_members_create_counterpart
  after insert or update of user_id on public.group_members
  for each row
  execute function public.handle_group_member_counterpart();

-- 既存のグループ・メンバーの分を作る
select public.create_default_counterparts(g.id) from public.groups g;

insert into public.counterparts (group_id, kind, user_id, sort_order)
select gm.group_id, 'member', gm.user_id, 0
from public.group_members gm
where gm.user_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 明細の相手（目的からの移し替え。基本設計書 5章・Q7）
-- ---------------------------------------------------------------------------

alter table public.receipt_details
  add column counterpart_id bigint references public.counterparts (id) on delete restrict;

-- 対応のない目的（上記・仕事以外の名前）は、同じ名前の任意の相手を、使っているグループにだけ作る。
-- 仕事は相手として作らず、個人と同じく帰属先のメンバーに移す（ユーザー確認済み）。
insert into public.counterparts (group_id, kind, name, sort_order)
select distinct r.group_id, 'custom', p.name, 100
from public.receipt_details d
join public.receipts r on r.id = d.receipt_id
join public.purposes p on p.id = d.purpose_id
where p.name not in ('生活維持', '個人', '仕事', '家族', '友人')
on conflict do nothing;

-- 個人・仕事 → 明細の帰属先のメンバー（共同、またはメンバーの相手がなければ「ふたり」に下の更新で入る）
update public.receipt_details d
  set counterpart_id = c.id
  from public.receipts r, public.purposes p, public.counterparts c
  where r.id = d.receipt_id
    and p.id = d.purpose_id
    and p.name in ('個人', '仕事')
    and c.group_id = r.group_id
    and c.kind = 'member'
    and c.user_id = d.owner_user_id;

-- 生活維持 → ふたり、家族 → 実家、友人 → 友人、個人・仕事の共同分 → ふたり、それ以外 → 同じ名前の任意の相手
update public.receipt_details d
  set counterpart_id = c.id
  from public.receipts r, public.purposes p, public.counterparts c
  where d.counterpart_id is null
    and r.id = d.receipt_id
    and p.id = d.purpose_id
    and c.group_id = r.group_id
    and c.kind <> 'member'
    and c.name = case p.name
      when '生活維持' then 'ふたり'
      when '個人' then 'ふたり'
      when '仕事' then 'ふたり'
      when '家族' then '実家'
      else p.name
    end;

alter table public.receipt_details alter column counterpart_id set not null;
create index receipt_details_counterpart_id_idx on public.receipt_details (counterpart_id);

-- 明細の相手が、レシートのグループの相手であることをDBでも保証する
create or replace function public.check_receipt_detail_counterpart()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.counterparts c
    join public.receipts r on r.id = new.receipt_id
    where c.id = new.counterpart_id
      and c.group_id = r.group_id
  ) then
    raise exception 'counterpart does not belong to the group of this receipt';
  end if;
  return new;
end;
$$;

create trigger receipt_details_check_counterpart
  before insert or update of counterpart_id on public.receipt_details
  for each row
  execute function public.check_receipt_detail_counterpart();

alter table public.receipt_details drop column purpose_id;

-- ---------------------------------------------------------------------------
-- タグ
-- ---------------------------------------------------------------------------

create table public.tags (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0,
  -- 使われているタグは削除できないため、選択肢から外したいときは非表示にする（基本設計書 Q4）
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_name_uniq unique (group_id, name)
);

create trigger tags_set_updated_at
  before update on public.tags
  for each row
  execute function public.set_updated_at();

alter table public.tags enable row level security;

create policy "member can read own group tags"
  on public.tags for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

-- 編集は管理者のみ（基本設計書 4.2節・Q2）
create policy "admin can write own group tags"
  on public.tags for all
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create table public.receipt_detail_tags (
  receipt_detail_id uuid not null references public.receipt_details (id) on delete cascade,
  -- 使われているタグは削除できない
  tag_id bigint not null references public.tags (id) on delete restrict,
  primary key (receipt_detail_id, tag_id)
);

create index receipt_detail_tags_tag_id_idx on public.receipt_detail_tags (tag_id);

alter table public.receipt_detail_tags enable row level security;

-- receipt_detail_scenes と同じく、receipts 経由でグループ判定・確定判定する
create policy "member can read own group receipt_detail_tags"
  on public.receipt_detail_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where d.id = receipt_detail_id
        and r.group_id in (select public.my_group_ids())
    )
  );

create policy "member can write own group receipt_detail_tags"
  on public.receipt_detail_tags for all
  to authenticated
  using (
    exists (
      select 1 from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where d.id = receipt_detail_id
        and r.group_id in (select public.my_group_ids())
    )
  )
  with check (
    exists (
      select 1 from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where d.id = receipt_detail_id
        and r.group_id in (select public.my_group_ids())
        and not public.is_settlement_confirmed(r.group_id, r.occurred_at)
    )
  );

-- 明細のタグが、レシートのグループのタグであることをDBでも保証する
create or replace function public.check_receipt_detail_tag()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tags t
    join public.receipt_details d on d.id = new.receipt_detail_id
    join public.receipts r on r.id = d.receipt_id
    where t.id = new.tag_id
      and t.group_id = r.group_id
  ) then
    raise exception 'tag does not belong to the group of this receipt';
  end if;
  return new;
end;
$$;

create trigger receipt_detail_tags_check_group
  before insert or update on public.receipt_detail_tags
  for each row
  execute function public.check_receipt_detail_tag();

-- シーン → タグ：今のシーンをすべて、同じ名前のタグとして各グループに作り、明細のシーンを移す
-- （基本設計書 5章）
insert into public.tags (group_id, name, sort_order)
select g.id, s.name, s.id
from public.groups g
cross join public.scenes s
on conflict do nothing;

insert into public.receipt_detail_tags (receipt_detail_id, tag_id)
select ds.receipt_detail_id, t.id
from public.receipt_detail_scenes ds
join public.scenes s on s.id = ds.scene_id
join public.receipt_details d on d.id = ds.receipt_detail_id
join public.receipts r on r.id = d.receipt_id
join public.tags t on t.group_id = r.group_id and t.name = s.name
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 目的・シーンの削除
-- ---------------------------------------------------------------------------

drop table public.receipt_detail_scenes;
drop table public.scenes;
drop table public.purposes;
