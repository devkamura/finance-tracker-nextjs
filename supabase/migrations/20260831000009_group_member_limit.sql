-- 要件定義書2.1/2.3章：1グループに登録できるユーザーは管理者含めて最大2人。
-- アプリ層（invite-group-member.ts）でも事前チェックするが、同時招待等の
-- 競合状態に備え、DBレベルでも最終防波堤として強制する
-- （group_members_one_admin_group_per_userと同じ思想）。
-- 招待中(user_id未確定)のメンバーも1枠として数える。

create or replace function public.enforce_group_member_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*) from public.group_members where group_id = new.group_id
  ) >= 2 then
    raise exception 'group member limit (2) reached';
  end if;
  return new;
end;
$$;

create trigger group_members_limit_check
  before insert on public.group_members
  for each row
  execute function public.enforce_group_member_limit();
