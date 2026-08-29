-- 管理者が自グループの一般メンバー・招待中(未参加)ユーザーを
-- グループから除籍できるようにする。
-- 「管理者アカウントとグループの関係は1対1」の一意インデックスにより
-- 1グループにつきrole='admin'の行は常に1件のみのため、role<>'admin'という条件だけで
-- 「管理者自身は削除できない」を確実に担保できる（対象が招待中(user_idがnull)でも同様）。
create policy "admin can remove non-admin group members"
  on public.group_members for delete
  to authenticated
  using (
    public.is_group_admin(group_id)
    and role <> 'admin'
  );
