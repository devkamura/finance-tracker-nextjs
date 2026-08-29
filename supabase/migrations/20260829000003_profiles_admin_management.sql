-- ユーザー名（表示名）の管理を「本人による自己編集」から「グループ管理者による管理」へ
-- 一本化する。一般ユーザーは自分/他人の表示名を編集できなくなる。

drop policy "user can update own profile" on public.profiles;

-- 管理者は自分のグループに所属するメンバー（自分自身を含む）のprofilesを
-- 参照・更新できる。admin_manages_user()は「対象が管理者自身」の場合もtrueになるため、
-- 管理者自身の表示名編集も別ポリシーなしでこれ一本でカバーできる。
create policy "admin can read managed profiles"
  on public.profiles for select
  to authenticated
  using (public.admin_manages_user(id));

create policy "admin can update managed profiles"
  on public.profiles for update
  to authenticated
  using (public.admin_manages_user(id))
  with check (public.admin_manages_user(id));

-- "user can read own profile" は既存のまま残す（AppHeaderの表示名取得に必要）。
