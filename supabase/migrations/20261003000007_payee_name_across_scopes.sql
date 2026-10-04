-- 分析拡充 F3（変更）：支払い先の名前の重複のルール（docs/分析拡充/基本設計書.md Q9）。
-- グループ全体と自分用の間でも、同じ名前は登録できないようにする（2026-10-03 ユーザー確認済み）。
-- 登録画面のプルダウンにはグループ全体と自分用が並ぶため、同じ名前が2つ出ないようにする。
-- ユーザーどうしの自分用（Aさん用とBさん用）は同じプルダウンに出ないため、重複を許す。
-- 同じ一覧の中の重複は、これまでどおり一意インデックス（payees_group_name_uniq・payees_owner_name_uniq）で防ぐ。

create or replace function public.check_payee_name_across_scopes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.owner_user_id is not null and exists (
    select 1 from public.payees p
    where p.group_id = new.group_id
      and p.name = new.name
      and p.owner_user_id is null
      and p.id is distinct from new.id
  ) then
    -- 画面で「同じ名前の支払い先が既に存在します」系のメッセージを出せるよう、一意制約違反と同じコードにする
    raise exception 'payee name conflicts with a shared payee' using errcode = '23505';
  end if;

  if new.owner_user_id is null and exists (
    select 1 from public.payees p
    where p.group_id = new.group_id
      and p.name = new.name
      and p.owner_user_id is not null
      and p.id is distinct from new.id
  ) then
    raise exception 'payee name conflicts with an own payee' using errcode = '23505';
  end if;

  return new;
end;
$$;

create trigger payees_check_name_across_scopes
  before insert or update of name on public.payees
  for each row
  execute function public.check_payee_name_across_scopes();
