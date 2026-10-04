-- 分析拡充 F3（追加）：支払い先の既定値にタグを加える（docs/分析拡充/基本設計書.md 3.4節）。
-- タグは複数選べるため、支払い先×タグの表で持つ。
-- 支払い先を選ぶと、明細のタグを既定値のタグに置き換える（既定値のタグがなければ明細のタグは残す）。

create table public.payee_default_tags (
  payee_id bigint not null references public.payees (id) on delete cascade,
  -- タグを削除したら、支払い先の既定値からも外す（ユーザー確認済み）
  tag_id bigint not null references public.tags (id) on delete cascade,
  primary key (payee_id, tag_id)
);

create index payee_default_tags_tag_id_idx on public.payee_default_tags (tag_id);

-- 既定値のタグが、支払い先のグループのタグであることをDBでも保証する
create or replace function public.check_payee_default_tag()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.payees p
    join public.tags t on t.group_id = p.group_id
    where p.id = new.payee_id and t.id = new.tag_id
  ) then
    raise exception 'default tag does not belong to the group of this payee';
  end if;
  return new;
end;
$$;

create trigger payee_default_tags_check_group
  before insert or update on public.payee_default_tags
  for each row
  execute function public.check_payee_default_tag();

alter table public.payee_default_tags enable row level security;

-- 参照は支払い先と同じくグループのメンバー全員
create policy "member can read own group payee_default_tags"
  on public.payee_default_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.payees p
      where p.id = payee_id and p.group_id in (select public.my_group_ids())
    )
  );

-- 編集は支払い先と同じ権限（グループ全体は管理者のみ、自分用は本人のみ）
create policy "payee editor can write payee_default_tags"
  on public.payee_default_tags for all
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
  )
  with check (
    exists (
      select 1 from public.payees p
      where p.id = payee_id
        and (
          (p.owner_user_id is null and public.is_group_admin(p.group_id))
          or (p.owner_user_id = auth.uid() and p.group_id in (select public.my_group_ids()))
        )
    )
  );
