-- 分析拡充 F3：支払い先（docs/分析拡充/基本設計書.md 2.6節・3.4〜3.6節・4章）。
-- 支払い先を「グループ全体」と「ユーザー別（自分用）」に分け、カテゴリ・内訳・相手・帰属先の
-- 既定値を持たせる。使われている支払い先は削除できないため、表示・非表示を持たせる（Q4）。
-- 既存の支払い先は、owner_user_id が null のため、すべて「グループ全体」として引き継がれる（既定値は空）。

-- ---------------------------------------------------------------------------
-- 列の追加
-- ---------------------------------------------------------------------------

alter table public.payees
  -- 登録者。null＝グループ全体、値あり＝そのユーザー用（自分用）
  add column owner_user_id uuid references auth.users (id) on delete cascade,
  -- 非表示にした支払い先は登録画面のプルダウンに出さない（既存のレシートの表示はそのまま）
  add column is_hidden boolean not null default false,
  -- 既定値（どれも任意）。参照先が削除されたら、その既定値だけを「設定しない」に戻す
  add column default_category_id bigint references public.categories (id) on delete set null,
  add column default_breakdown_id bigint references public.category_breakdowns (id) on delete set null,
  add column default_counterpart_id bigint references public.counterparts (id) on delete set null,
  -- 帰属先の既定値：設定しない（false・null）／共同（true・null）／メンバー（false・ユーザー）
  add column default_owner_joint boolean not null default false,
  add column default_owner_user_id uuid references auth.users (id) on delete set null,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add constraint payees_default_owner_check
    check (not (default_owner_joint and default_owner_user_id is not null)),
  -- 内訳の既定値はカテゴリの既定値があるときだけ設定できる
  add constraint payees_default_breakdown_check
    check (default_breakdown_id is null or default_category_id is not null);

create index payees_owner_user_id_idx on public.payees (owner_user_id);

create trigger payees_set_updated_at
  before update on public.payees
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 名前の重複（基本設計書 Q9）
-- ---------------------------------------------------------------------------

-- 同じ一覧（グループ全体、または同じユーザーの自分用）の中では重複できない。
-- グループ全体と自分用の間の重複は許す。
alter table public.payees drop constraint payees_group_name_uniq;

create unique index payees_group_name_uniq
  on public.payees (group_id, name) where owner_user_id is null;
create unique index payees_owner_name_uniq
  on public.payees (group_id, owner_user_id, name) where owner_user_id is not null;

-- ---------------------------------------------------------------------------
-- 整合性のチェック
-- ---------------------------------------------------------------------------

-- 登録者・既定値が、支払い先のグループのものであることをDBでも保証する
-- （画面・Server Actionでも検証するが、不整合なデータを入れられないようにする）。
-- 登録者（グループ全体／自分用）は後から変えられない。
create or replace function public.check_payee_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.owner_user_id is distinct from old.owner_user_id
    or new.group_id is distinct from old.group_id
  ) then
    raise exception 'payee owner and group cannot be changed';
  end if;

  if tg_op = 'INSERT' and new.owner_user_id is not null and not exists (
    select 1 from public.group_members gm
    where gm.group_id = new.group_id and gm.user_id = new.owner_user_id
  ) then
    raise exception 'payee owner must be a member of the group';
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

create trigger payees_check_defaults
  before insert or update on public.payees
  for each row
  execute function public.check_payee_defaults();

-- 内訳の既定値は、内訳を削除したとき（on delete set null）以外に、カテゴリの既定値を変えたときも
-- 合わなくなる。その場合はトリガーで拒否されるため、画面・Server Actionで内訳も選び直す。

-- ---------------------------------------------------------------------------
-- RLS（基本設計書 4.2節）
-- ---------------------------------------------------------------------------

-- 参照はグループのメンバー全員（相方の自分用も、一覧・設定画面で表示するため読める）。
-- 編集は、グループ全体は管理者のみ、自分用は登録したユーザー本人のみ。
drop policy "admin can write own group payees" on public.payees;

create policy "admin can write own group shared payees"
  on public.payees for all
  to authenticated
  using (owner_user_id is null and public.is_group_admin(group_id))
  with check (owner_user_id is null and public.is_group_admin(group_id));

create policy "member can write own payees"
  on public.payees for all
  to authenticated
  using (owner_user_id = auth.uid() and group_id in (select public.my_group_ids()))
  with check (owner_user_id = auth.uid() and group_id in (select public.my_group_ids()));
