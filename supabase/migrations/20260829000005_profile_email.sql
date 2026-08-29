-- ユーザー管理画面で「どのユーザーか」を判別できるよう、
-- profilesにメールアドレスを保持する（auth.usersは管理者でもクライアントから直接参照できないため）。

alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null;

-- 新規サインアップ時にもメールアドレスを保存する。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email,
      'unknown'
    ),
    new.email
  );

  perform public._link_group_membership(new.id, new.email);
  return new;
end;
$$;
