-- 現状のprofiles RLSは「本人」または「管理者が管理するメンバー」しか読めない
-- （admin_manages_user()）。レシート機能では一般メンバーも支払者・帰属先の選択や
-- 精算画面で相方の表示名を見る必要があるため、同じグループに所属するメンバー同士は
-- 互いのprofilesを読めるポリシーを追加する（書き込みは既存ポリシーのまま管理者限定）。

create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members my
    join public.group_members their on their.group_id = my.group_id
    where my.user_id = auth.uid() and their.user_id = p_user_id
  );
$$;

revoke all on function public.shares_group_with(uuid) from public;
grant execute on function public.shares_group_with(uuid) to authenticated;

create policy "member can read same group profiles"
  on public.profiles for select
  to authenticated
  using (public.shares_group_with(id));
