-- 支払い先の一本化（docs/requirements.md「追加機能：支払い先の一本化（ユーザーごとの表示／非表示）」）。
-- 「グループ全体／自分用」の区別をやめ、支払い先はグループで1つの一覧にする。
-- 既定値は、登録したときの内容を共通の既定値とし（登録後もメンバー全員が変更できる）、メンバーごとに自分用に上書きできる。
-- プルダウンに出すかどうかは、メンバーごとの非表示で決める。
-- 登録・編集・削除はグループのメンバー全員ができる。

-- ---------------------------------------------------------------------------
-- メンバーごとの非表示
-- ---------------------------------------------------------------------------

-- 行がある＝そのメンバーはその支払い先を非表示にしている（プルダウンに出さない）。
-- 行がなければ表示。新しく登録した支払い先は行がないため、全員に表示される。
create table public.payee_hidden_members (
  payee_id bigint not null references public.payees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (payee_id, user_id)
);

create index payee_hidden_members_user_id_idx on public.payee_hidden_members (user_id);

-- ---------------------------------------------------------------------------
-- メンバーごとの既定値（自分用の既定値。共通の既定値の上書き）
-- ---------------------------------------------------------------------------

-- 行がある＝そのメンバーは、この支払い先で共通の既定値の代わりにこの既定値を使う。
-- 一式まるごと持つ（項目ごとには上書きしない）。列の意味は payees の default_* と同じ。
-- 参照先（カテゴリ・内訳・相手・メンバー）が削除されたら、共通の既定値と同じく「設定しない」に戻す。
create table public.payee_member_defaults (
  payee_id bigint not null references public.payees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  default_category_id bigint references public.categories (id) on delete set null,
  default_breakdown_id bigint references public.category_breakdowns (id) on delete set null,
  default_counterpart_id bigint references public.counterparts (id) on delete set null,
  default_owner_joint boolean not null default false,
  default_owner_user_id uuid references auth.users (id) on delete set null,
  -- 商品名の既定値（payees.default_item_name と同じ。null＝設定しない）
  default_item_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (payee_id, user_id),
  constraint payee_member_defaults_owner_check
    check (not (default_owner_joint and default_owner_user_id is not null)),
  constraint payee_member_defaults_breakdown_check
    check (default_breakdown_id is null or default_category_id is not null)
);

create index payee_member_defaults_user_id_idx on public.payee_member_defaults (user_id);

-- 自分用の既定値のタグ（payee_default_tags の自分用版）
create table public.payee_member_default_tags (
  payee_id bigint not null,
  user_id uuid not null,
  -- タグを削除したら、自分用の既定値からも外す（共通の既定値と同じ）
  tag_id bigint not null references public.tags (id) on delete cascade,
  primary key (payee_id, user_id, tag_id),
  foreign key (payee_id, user_id)
    references public.payee_member_defaults (payee_id, user_id) on delete cascade
);

create index payee_member_default_tags_tag_id_idx on public.payee_member_default_tags (tag_id);

-- ---------------------------------------------------------------------------
-- 既存データの移行
-- ---------------------------------------------------------------------------

-- 同じ名前の支払い先（相方同士の自分用）を1つにまとめる。残す支払い先（keeper）は管理者の方。
-- 管理者の自分用がなければ、先に登録された方（id の小さい方）を残す。
create temporary table payee_merge_map on commit drop as
select
  p.id as payee_id,
  first_value(p.id) over (
    partition by p.group_id, p.name
    order by
      (p.owner_user_id is null) desc,
      coalesce(gm.role = 'admin', false) desc,
      p.id
  ) as keeper_id
from public.payees p
left join public.group_members gm
  on gm.group_id = p.group_id and gm.user_id = p.owner_user_id;

-- 表示は今のプルダウンの内容を変えない：
-- グループ全体 → 全員に表示、自分用 → 本人だけ表示、非表示 → 全員非表示。
-- まとめた支払い先は、まとめる前にどれかを表示していたメンバーには表示する。
insert into public.payee_hidden_members (payee_id, user_id)
select k.id, gm.user_id
from public.payees k
join public.group_members gm on gm.group_id = k.group_id and gm.user_id is not null
where k.id in (select keeper_id from payee_merge_map)
  and not exists (
    select 1
    from payee_merge_map m
    join public.payees p on p.id = m.payee_id
    where m.keeper_id = k.id
      and not p.is_hidden
      and (p.owner_user_id is null or p.owner_user_id = gm.user_id)
  );

-- まとめられた側の既定値が、残す側（共通の既定値になる）と違うときだけ、
-- まとめられた側の登録者の自分用の既定値として残す（グループに残っているメンバーだけ）。
create temporary table payee_merge_overrides on commit drop as
select m.keeper_id, p.id as merged_id, p.owner_user_id as user_id
from payee_merge_map m
join public.payees p on p.id = m.payee_id
join public.payees k on k.id = m.keeper_id
where m.payee_id <> m.keeper_id
  and p.owner_user_id is not null
  and exists (
    select 1 from public.group_members gm
    where gm.group_id = p.group_id and gm.user_id = p.owner_user_id
  )
  and (
    (p.default_category_id, p.default_breakdown_id, p.default_counterpart_id,
     p.default_owner_joint, p.default_owner_user_id)
    is distinct from
    (k.default_category_id, k.default_breakdown_id, k.default_counterpart_id,
     k.default_owner_joint, k.default_owner_user_id)
    or array(select t.tag_id from public.payee_default_tags t where t.payee_id = p.id order by t.tag_id)
       is distinct from
       array(select t.tag_id from public.payee_default_tags t where t.payee_id = k.id order by t.tag_id)
  );

insert into public.payee_member_defaults (
  payee_id, user_id, default_category_id, default_breakdown_id, default_counterpart_id,
  default_owner_joint, default_owner_user_id
)
select o.keeper_id, o.user_id, p.default_category_id, p.default_breakdown_id,
  p.default_counterpart_id, p.default_owner_joint, p.default_owner_user_id
from payee_merge_overrides o
join public.payees p on p.id = o.merged_id;

insert into public.payee_member_default_tags (payee_id, user_id, tag_id)
select o.keeper_id, o.user_id, t.tag_id
from payee_merge_overrides o
join public.payee_default_tags t on t.payee_id = o.merged_id;

-- レシート・別名を残す支払い先に付け替える。レシートの内容（明細・更新日時）は変えない。
alter table public.receipts disable trigger receipts_set_updated_at;

update public.receipts r
  set payee_id = m.keeper_id
  from payee_merge_map m
  where r.payee_id = m.payee_id and m.payee_id <> m.keeper_id;

alter table public.receipts enable trigger receipts_set_updated_at;

update public.payee_aliases a
  set payee_id = m.keeper_id
  from payee_merge_map m
  where a.payee_id = m.payee_id and m.payee_id <> m.keeper_id;

-- まとめられた側を削除する（既定値は残す側のものを使う。既定値のタグは cascade で消える）
delete from public.payees p
  using payee_merge_map m
  where p.id = m.payee_id and m.payee_id <> m.keeper_id;

-- ---------------------------------------------------------------------------
-- 「グループ全体／自分用」「グループ共通の非表示」をなくす
-- ---------------------------------------------------------------------------

-- 登録者（owner_user_id）を見ているポリシー・トリガーを先に外す
drop policy "admin can write own group shared payees" on public.payees;
drop policy "member can write own payees" on public.payees;
drop policy "payee editor can write payee_default_tags" on public.payee_default_tags;
drop policy "payee editor can delete payee_aliases" on public.payee_aliases;

drop trigger payees_check_name_across_scopes on public.payees;
drop function public.check_payee_name_across_scopes();

drop index public.payees_group_name_uniq;
drop index public.payees_owner_name_uniq;
drop index public.payees_owner_user_id_idx;

alter table public.payees
  drop column owner_user_id,
  drop column is_hidden,
  -- 商品名の既定値。支払い先を選んだとき、商品名が空の明細にだけ入れる（入力済み・画像で読めた商品名は消さない）。
  -- null＝設定しない
  add column default_item_name text;

-- 名前はグループの中で一意
create unique index payees_group_name_uniq on public.payees (group_id, name);

-- 既定値が、支払い先のグループのものであることをDBでも保証する（登録者の確認をなくした）。
create or replace function public.check_payee_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    raise exception 'payee group cannot be changed';
  end if;

  -- 内訳の既定値は、既定値のカテゴリ・支払い先のグループの内訳であること
  if new.default_breakdown_id is not null and not exists (
    select 1 from public.category_breakdowns b
    where b.id = new.default_breakdown_id
      and b.category_id = new.default_category_id
      and b.group_id = new.group_id
  ) then
    raise exception 'default breakdown does not belong to the default category of this group';
  end if;

  if new.default_counterpart_id is not null and not exists (
    select 1 from public.counterparts c
    where c.id = new.default_counterpart_id and c.group_id = new.group_id
  ) then
    raise exception 'default counterpart does not belong to this group';
  end if;

  -- 帰属先の既定値のメンバーは、変更したときだけ確認する（後からメンバーが外れても保存済みの値は残す）
  if new.default_owner_user_id is not null
    and (tg_op = 'INSERT' or new.default_owner_user_id is distinct from old.default_owner_user_id)
    and not exists (
      select 1 from public.group_members gm
      where gm.group_id = new.group_id and gm.user_id = new.default_owner_user_id
    ) then
    raise exception 'default owner must be a member of the group';
  end if;

  return new;
end;
$$;

-- メンバーごとの既定値が、支払い先のグループのもので、本人がそのグループのメンバーであることをDBでも保証する。
create or replace function public.check_payee_member_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if tg_op = 'UPDATE' and (new.payee_id <> old.payee_id or new.user_id <> old.user_id) then
    raise exception 'payee member defaults key cannot be changed';
  end if;

  select group_id into v_group_id from public.payees where id = new.payee_id;

  if tg_op = 'INSERT' and not exists (
    select 1 from public.group_members gm
    where gm.group_id = v_group_id and gm.user_id = new.user_id
  ) then
    raise exception 'member defaults user must be a member of the group';
  end if;

  if new.default_breakdown_id is not null and not exists (
    select 1 from public.category_breakdowns b
    where b.id = new.default_breakdown_id
      and b.category_id = new.default_category_id
      and b.group_id = v_group_id
  ) then
    raise exception 'default breakdown does not belong to the default category of this group';
  end if;

  if new.default_counterpart_id is not null and not exists (
    select 1 from public.counterparts c
    where c.id = new.default_counterpart_id and c.group_id = v_group_id
  ) then
    raise exception 'default counterpart does not belong to this group';
  end if;

  if new.default_owner_user_id is not null
    and (tg_op = 'INSERT' or new.default_owner_user_id is distinct from old.default_owner_user_id)
    and not exists (
      select 1 from public.group_members gm
      where gm.group_id = v_group_id and gm.user_id = new.default_owner_user_id
    ) then
    raise exception 'default owner must be a member of the group';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger payee_member_defaults_check
  before insert or update on public.payee_member_defaults
  for each row
  execute function public.check_payee_member_defaults();

-- 自分用の既定値のタグも、支払い先のグループのタグであること（共通の既定値のタグと同じ確認）
create trigger payee_member_default_tags_check_group
  before insert or update on public.payee_member_default_tags
  for each row
  execute function public.check_payee_default_tag();

-- メンバーがグループから外れたら、そのグループの支払い先の自分用の既定値を削除する
create or replace function public.delete_payee_member_defaults_on_leave()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.user_id is not null then
    delete from public.payee_member_defaults d
      using public.payees p
      where d.payee_id = p.id and p.group_id = old.group_id and d.user_id = old.user_id;
  end if;
  return old;
end;
$$;

create trigger group_members_delete_payee_member_defaults
  after delete on public.group_members
  for each row
  execute function public.delete_payee_member_defaults_on_leave();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- 支払い先・既定値のタグ・別名の編集は、グループのメンバー全員ができる（参照のポリシーはこれまでどおり）。
create policy "member can write own group payees"
  on public.payees for all
  to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (group_id in (select public.my_group_ids()));

-- 共通の既定値のタグは、メンバー全員が追加・削除（入れ替え）できる（支払い先の削除では cascade で消える）。
create policy "member can insert own group payee_default_tags"
  on public.payee_default_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

create policy "member can delete own group payee_default_tags"
  on public.payee_default_tags for delete
  to authenticated
  using (
    exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

-- 別名の追加は過去のレシートの切り替えと一緒に行うため、add_payee_alias からだけ行う（直接の追加は不可）。
create policy "member can delete own group payee_aliases"
  on public.payee_aliases for delete
  to authenticated
  using (group_id in (select public.my_group_ids()));

alter table public.payee_hidden_members enable row level security;

-- 参照はグループのメンバー全員（全員が非表示にしているかを分析の選択肢で見るため、相方の分も読める）。
create policy "member can read own group payee_hidden_members"
  on public.payee_hidden_members for select
  to authenticated
  using (
    exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

-- 切り替えられるのは自分の分だけ（相方の表示／非表示は変えられない）。
create policy "member can hide own group payees for self"
  on public.payee_hidden_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

create policy "member can unhide payees for self"
  on public.payee_hidden_members for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.payee_member_defaults enable row level security;
alter table public.payee_member_default_tags enable row level security;

-- 自分用の既定値の参照はグループのメンバー全員（設定画面で「〇〇さんは自分用」を出すため）。
create policy "member can read own group payee_member_defaults"
  on public.payee_member_defaults for select
  to authenticated
  using (
    exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

-- 作成・変更・削除は自分の分だけ（相方の自分用は変えられない）。
create policy "member can write own payee_member_defaults"
  on public.payee_member_defaults for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

create policy "member can read own group payee_member_default_tags"
  on public.payee_member_default_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

create policy "member can write own payee_member_default_tags"
  on public.payee_member_default_tags for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 別名の追加と過去のレシートの切り替え
-- ---------------------------------------------------------------------------

-- 別名を追加し、店名が別名と一致する過去のレシート（支払い先に紐づいていないもの）を、その支払い先に切り替える。
-- - 切り替えるのは支払い先（payee_id）と店名だけ。明細の値は変えない（支払い先の既定値は当てない）
-- - 精算確定済みの月のレシートも切り替える（金額は変わらず、精算結果に影響しないため。
--   確定済みの月はRLSで更新できないため、security definer で更新する）
-- - グループ全員のレシートを切り替える（誰が登録したか・誰が非表示にしているかによらない）
-- 権限は支払い先の編集と同じ（グループのメンバー全員）。
-- 戻り値：{ id, name, converted }（converted＝切り替えたレシートの件数）
create or replace function public.add_payee_alias(p_payee_id bigint, p_name text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_payee public.payees;
  v_name text := public.normalize_payee_name(p_name);
  v_alias_id bigint;
  v_converted integer;
begin
  select * into v_payee
  from public.payees
  where id = p_payee_id and group_id in (select public.my_group_ids());
  if not found then
    raise exception 'payee not found' using errcode = 'P0002';
  end if;

  if v_name = '' then
    raise exception 'alias name is empty' using errcode = '22023';
  end if;

  insert into public.payee_aliases (payee_id, group_id, name)
  values (v_payee.id, v_payee.group_id, v_name)
  returning id into v_alias_id;

  update public.receipts r
    set payee_id = v_payee.id,
        payee_name = v_payee.name
    where r.group_id = v_payee.group_id
      and r.payee_id is null
      and public.normalize_payee_name(r.payee_name) = v_name;
  get diagnostics v_converted = row_count;

  return json_build_object('id', v_alias_id, 'name', v_name, 'converted', v_converted);
end;
$$;
