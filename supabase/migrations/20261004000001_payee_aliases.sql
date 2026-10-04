-- 分析拡充 F5：支払い先の別名（docs/分析拡充/要件定義書.md 4.7節・詳細設計書.md F5）。
-- 手入力・画像読み取りで入った店名（例：オーケー長津田店）を、登録済みの支払い先（例：オーケー）に寄せる。
-- 別名を登録すると、店名が別名と一致する過去のレシートを、その支払い先に切り替える。

-- ---------------------------------------------------------------------------
-- 店名の比較
-- ---------------------------------------------------------------------------

-- 前後の空白（半角・全角・タブ・改行）を除く。画面（lib/receipts/payees.ts の normalizePayeeName）と同じ規則。
create or replace function public.normalize_payee_name(p_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_name, ''), '^[\s　]+|[\s　]+$', '', 'g');
$$;

-- ---------------------------------------------------------------------------
-- 別名
-- ---------------------------------------------------------------------------

create table public.payee_aliases (
  id bigint generated always as identity primary key,
  payee_id bigint not null references public.payees (id) on delete cascade,
  -- 別名の重複をグループの中で防ぐため、支払い先のグループを持つ（トリガーで支払い先から入れる）
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (length(name) > 0 and name = public.normalize_payee_name(name)),
  created_at timestamptz not null default now(),
  -- 同じ別名は、グループの中で1つの支払い先にしか登録できない（グループ全体用と自分用をまたいでも不可）
  constraint payee_aliases_group_name_uniq unique (group_id, name)
);

create index payee_aliases_payee_id_idx on public.payee_aliases (payee_id);

-- 別名のグループは支払い先のグループにそろえる。登録済みの支払い先の名前そのものは別名にできない。
create or replace function public.check_payee_alias()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select p.group_id into new.group_id from public.payees p where p.id = new.payee_id;

  if exists (
    select 1 from public.payees p
    where p.group_id = new.group_id and p.name = new.name
  ) then
    -- 画面で重複のメッセージを出せるよう、一意制約違反と同じコードにする
    raise exception 'payee alias conflicts with a payee name' using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger payee_aliases_check
  before insert or update on public.payee_aliases
  for each row
  execute function public.check_payee_alias();

-- 逆に、別名として登録済みの名前は、支払い先の名前にできない（名前の追加・変更）
create or replace function public.check_payee_name_not_alias()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.payee_aliases a
    where a.group_id = new.group_id and a.name = new.name
  ) then
    raise exception 'payee name conflicts with an alias' using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger payees_check_name_not_alias
  before insert or update of name on public.payees
  for each row
  execute function public.check_payee_name_not_alias();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.payee_aliases enable row level security;

-- 参照は支払い先と同じくグループのメンバー全員
create policy "member can read own group payee_aliases"
  on public.payee_aliases for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

-- 削除は支払い先と同じ権限（グループ全体は管理者のみ、自分用は本人のみ）。
-- 追加は過去のレシートの切り替えと一緒に行うため、add_payee_alias からだけ行う（直接の追加は不可）。
create policy "payee editor can delete payee_aliases"
  on public.payee_aliases for delete
  to authenticated
  using (
    exists (
      select 1 from public.payees p
      where p.id = payee_id
        and (
          (p.owner_user_id is null and public.is_group_admin(p.group_id))
          or (p.owner_user_id = auth.uid() and p.group_id in (select public.my_group_ids()))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 別名の追加と過去のレシートの切り替え
-- ---------------------------------------------------------------------------

-- 別名を追加し、店名が別名と一致する過去のレシート（支払い先に紐づいていないもの）を、その支払い先に切り替える。
-- - 切り替えるのは支払い先（payee_id）と店名だけ。明細の値は変えない（支払い先の既定値は当てない）
-- - 精算確定済みの月のレシートも切り替える（金額は変わらず、精算結果に影響しないため。
--   確定済みの月はRLSで更新できないため、security definer で更新する）
-- - 自分用の支払い先の別名で切り替えるのは、その本人が登録したレシートだけ
--   （相方のレシートが自分用の支払い先に紐づかないようにする）
-- 権限は支払い先の編集と同じ（グループ全体は管理者のみ、自分用は本人のみ）。
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

  if (v_payee.owner_user_id is null and not public.is_group_admin(v_payee.group_id))
    or (v_payee.owner_user_id is not null and v_payee.owner_user_id <> auth.uid()) then
    raise exception 'permission denied' using errcode = '42501';
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
      and public.normalize_payee_name(r.payee_name) = v_name
      and (v_payee.owner_user_id is null or r.created_by = v_payee.owner_user_id);
  get diagnostics v_converted = row_count;

  return json_build_object('id', v_alias_id, 'name', v_name, 'converted', v_converted);
end;
$$;

revoke all on function public.add_payee_alias(bigint, text) from public;
grant execute on function public.add_payee_alias(bigint, text) to authenticated;
