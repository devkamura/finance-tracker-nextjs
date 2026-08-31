-- 精算の確定・再オープンRPC。どちらも管理者のみ実行可能。
-- settlement_periodsには直接のINSERT/UPDATEポリシーを設けていないため、
-- 書き込みはこの2つのSECURITY DEFINER関数経由に限定する
-- （groups.create_group_with_adminと同じ思想）。
-- 計算ロジック自体（按分・符号反転・負担額等）はアプリ側(lib/settlement/calculate.ts)で
-- 行い、この関数は計算済みの値を受け取って検証・保存するだけに留める。

create or replace function public.confirm_settlement(
  p_group_id uuid,
  p_period_month date,
  p_user_a_id uuid,
  p_user_b_id uuid,
  p_user_a_burden integer,
  p_user_b_burden integer,
  p_user_a_paid integer,
  p_user_b_paid integer,
  p_settlement_amount integer,
  p_settlement_from_user_id uuid,
  p_settlement_to_user_id uuid
)
returns public.settlement_periods
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.settlement_periods;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'only the group admin can confirm a settlement';
  end if;
  if (
    select count(*) from public.group_members
    where group_id = p_group_id and user_id in (p_user_a_id, p_user_b_id)
  ) <> 2 then
    raise exception 'user_a/user_b must be members of the group';
  end if;
  if p_settlement_amount < 0 then
    raise exception 'settlement_amount must not be negative';
  end if;

  insert into public.settlement_periods (
    group_id, period_month, status,
    user_a_id, user_b_id,
    user_a_burden, user_b_burden, user_a_paid, user_b_paid,
    settlement_amount, settlement_from_user_id, settlement_to_user_id,
    confirmed_by, confirmed_at
  ) values (
    p_group_id, date_trunc('month', p_period_month)::date, 'confirmed',
    p_user_a_id, p_user_b_id,
    p_user_a_burden, p_user_b_burden, p_user_a_paid, p_user_b_paid,
    p_settlement_amount, p_settlement_from_user_id, p_settlement_to_user_id,
    auth.uid(), now()
  )
  on conflict (group_id, period_month) do update set
    status = 'confirmed',
    user_a_id = excluded.user_a_id,
    user_b_id = excluded.user_b_id,
    user_a_burden = excluded.user_a_burden,
    user_b_burden = excluded.user_b_burden,
    user_a_paid = excluded.user_a_paid,
    user_b_paid = excluded.user_b_paid,
    settlement_amount = excluded.settlement_amount,
    settlement_from_user_id = excluded.settlement_from_user_id,
    settlement_to_user_id = excluded.settlement_to_user_id,
    confirmed_by = auth.uid(),
    confirmed_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.confirm_settlement(
  uuid, date, uuid, uuid, integer, integer, integer, integer, integer, uuid, uuid
) from public;
grant execute on function public.confirm_settlement(
  uuid, date, uuid, uuid, integer, integer, integer, integer, integer, uuid, uuid
) to authenticated;

-- 確定済みの月を再オープンする。管理者のみ実行可能。
create or replace function public.reopen_settlement(
  p_group_id uuid,
  p_period_month date
)
returns public.settlement_periods
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.settlement_periods;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'only the group admin can reopen a settlement';
  end if;

  update public.settlement_periods
  set status = 'reopened',
      reopened_by = auth.uid(),
      reopened_at = now()
  where group_id = p_group_id
    and period_month = date_trunc('month', p_period_month)::date
    and status = 'confirmed'
  returning * into v_row;

  if v_row is null then
    raise exception 'no confirmed settlement found for this period';
  end if;

  return v_row;
end;
$$;

revoke all on function public.reopen_settlement(uuid, date) from public;
grant execute on function public.reopen_settlement(uuid, date) to authenticated;
