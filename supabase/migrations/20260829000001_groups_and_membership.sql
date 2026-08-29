-- グループ機能: グループ本体とグループ所属（管理者/一般メンバー）を管理するテーブル群。
-- 「現在は1ユーザー=1グループ」で運用するが、将来1アカウントが複数グループに
-- 所属できるよう、group_membersはuser_id単体のユニーク制約を持たない多対多の形にする。

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- user_idがnullableなのは、管理者が「まだGoogleログインしたことのないユーザー」を
-- Gmailアドレスだけで先に招待登録できるようにするため。
-- 対象ユーザーが初めてログインした時点でuser_idが埋まる（_link_group_membership参照）。
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_members_user_or_email_present
    check (user_id is not null or invited_email is not null)
);

-- 同一グループへの重複所属・重複招待を防止する。
create unique index group_members_group_user_uniq
  on public.group_members (group_id, user_id)
  where user_id is not null;

create unique index group_members_group_email_uniq
  on public.group_members (group_id, lower(trim(invited_email)))
  where invited_email is not null;

-- 「管理者アカウントとグループの関係は1対1」をDBレベルで保証する。
-- グループ作成RPCの二重実行（連打等の競合状態）に対する最終防波堤でもある。
create unique index group_members_one_admin_group_per_user
  on public.group_members (user_id)
  where role = 'admin' and user_id is not null;

create index group_members_user_id_idx on public.group_members (user_id);
create index group_members_group_id_idx on public.group_members (group_id);

create trigger group_members_set_updated_at
  before update on public.group_members
  for each row
  execute function public.set_updated_at();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- RLSポリシー内でgroup_membersへの参照が絡み合うのを避けるため、
-- 判定ロジックをSECURITY DEFINER関数に集約する。
-- 将来「現在選択中グループ」の概念を導入する際も、変更箇所をここに限定できる。
create or replace function public.my_group_ids()
returns setof uuid
language sql
stable security definer set search_path = public
as $$
  select group_id from public.group_members where user_id = auth.uid();
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- 「管理者が自分自身を対象にした場合」もtrueになるため、
-- 「管理者は自分の表示名も管理画面から編集できる」を別ポリシーなしで満たせる。
create or replace function public.admin_manages_user(p_user_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members admin_gm
    join public.group_members target_gm on target_gm.group_id = admin_gm.group_id
    where admin_gm.user_id = auth.uid()
      and admin_gm.role = 'admin'
      and target_gm.user_id = p_user_id
  );
$$;

revoke all on function public.my_group_ids() from public;
revoke all on function public.is_group_admin(uuid) from public;
revoke all on function public.admin_manages_user(uuid) from public;
grant execute on function public.my_group_ids() to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.admin_manages_user(uuid) to authenticated;

-- groups/group_membersへの書き込みは原則RPC経由に限定し、直接INSERT/UPDATE/DELETEの
-- ポリシーは設けない（stores等の既存マスタデータと同じ「読み取りのみ公開」の思想）。
-- 例外として「管理者が自グループへ招待用の行を足す」操作だけは単純でアトミック性の
-- 懸念がないため直接INSERTを許可する。
create policy "member can read own group"
  on public.groups for select
  to authenticated
  using (id in (select public.my_group_ids()));

create policy "member can read own group members"
  on public.group_members for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

create policy "admin can invite member by email"
  on public.group_members for insert
  to authenticated
  with check (
    public.is_group_admin(group_id)
    and user_id is null
    and invited_email is not null
    and role = 'member'
  );

-- グループ作成+管理者登録をアトミックに行うRPC。
-- groups/group_membersにINSERTポリシーを設けていないため、認証済みユーザーからの
-- 直接INSERTは常にRLSで拒否される。SECURITY DEFINERで実行することで、
-- 2テーブルへのINSERTを1トランザクションで完結させ「グループはできたが管理者行が
-- ない」ような中途半端な状態を防ぐ。
create or replace function public.create_group_with_admin(p_name text)
returns public.groups
language plpgsql
security definer set search_path = public
as $$
declare
  v_group public.groups;
  v_name text := trim(p_name);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v_name = '' then
    raise exception 'group name is required';
  end if;

  -- 「未所属ユーザーのみグループ作成可能」の事前チェック。
  -- 真の競合状態（同時に2リクエストが両方ここを通過するケース）は
  -- group_members_one_admin_group_per_user の一意インデックス違反で最終的に防がれる。
  if exists (select 1 from public.group_members where user_id = auth.uid()) then
    raise exception 'user already belongs to a group';
  end if;

  insert into public.groups (name, created_by)
  values (v_name, auth.uid())
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'admin');

  return v_group;
end;
$$;

revoke all on function public.create_group_with_admin(text) from public;
grant execute on function public.create_group_with_admin(text) to authenticated;

-- 事前登録されたGmailアドレスと、実際にログインしたGoogleアカウントのメールアドレスを
-- 正規化(lower/trim)して突き合わせ、一致すればグループメンバーとして紐付ける。
create or replace function public._link_group_membership(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' then
    return;
  end if;

  update public.group_members
  set user_id = p_user_id, updated_at = now()
  where user_id is null
    and lower(trim(invited_email)) = v_email;
end;
$$;

-- 新規サインアップ時（handle_new_userトリガー経由）に即座に紐付けを試みる。
-- 既存のprofiles自動作成ロジックはそのまま維持し、招待紐付け処理のみ追加する。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email,
      'unknown'
    )
  );

  perform public._link_group_membership(new.id, new.email);
  return new;
end;
$$;

-- 「既にサインアップ済みのユーザーが後日招待される」ケースはトリガーでは
-- 捕捉できない（トリガーはauth.usersへのINSERT時にのみ発火するため）ので、
-- ログイン毎にauth/callbackから呼び出す用のRPCを用意する。
create or replace function public.link_pending_group_memberships()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    return;
  end if;

  select email into v_email from auth.users where id = v_uid;
  perform public._link_group_membership(v_uid, v_email);
end;
$$;

revoke all on function public.link_pending_group_memberships() from public;
grant execute on function public.link_pending_group_memberships() to authenticated;
