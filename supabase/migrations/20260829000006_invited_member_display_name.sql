-- 招待中（未参加）のユーザーについても、管理者がユーザー名を先に登録・編集できるようにする。
-- 対象ユーザーが実際にログインしてグループに紐付いた時点で、profiles.display_nameへ引き継ぐ。

alter table public.group_members add column invited_display_name text;

-- 招待中(user_idがnull)の行に限り、管理者は表示名を更新できる。
-- 参加済み(user_idが埋まった)行の表示名編集はprofilesテーブル側(admin can update managed profiles)で行う。
create policy "admin can update invited member display name"
  on public.group_members for update
  to authenticated
  using (
    public.is_group_admin(group_id)
    and user_id is null
  )
  with check (
    public.is_group_admin(group_id)
    and user_id is null
  );

create or replace function public._link_group_membership(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invited_name text;
begin
  if v_email = '' then
    return;
  end if;

  update public.group_members
  set user_id = p_user_id, updated_at = now()
  where user_id is null
    and lower(trim(invited_email)) = v_email
  returning invited_display_name into v_invited_name;

  if v_invited_name is not null and trim(v_invited_name) <> '' then
    update public.profiles set display_name = v_invited_name where id = p_user_id;
  end if;
end;
$$;
