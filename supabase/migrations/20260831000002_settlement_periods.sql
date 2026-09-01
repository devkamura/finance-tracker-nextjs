-- 月次精算の確定記録。
-- 精算自体は都度計算（このテーブルには保持しない）だが、「確定」した月だけは
-- スナップショットを保存し、以後は再計算しても値が変わらないようにする。
-- 管理者は確定済みの月を「再オープン」でき、再オープン中はレシートの編集・削除・追加が
-- 可能になる（is_settlement_confirmed()参照、receiptsテーブルは次のマイグレーションで作成）。

create table public.settlement_periods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  period_month date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'reopened')),
  user_a_id uuid not null references auth.users (id),
  user_b_id uuid not null references auth.users (id),
  user_a_burden integer not null,
  user_b_burden integer not null,
  user_a_paid integer not null,
  user_b_paid integer not null,
  settlement_amount integer not null check (settlement_amount >= 0),
  settlement_from_user_id uuid not null references auth.users (id),
  settlement_to_user_id uuid not null references auth.users (id),
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null default now(),
  reopened_by uuid references auth.users (id),
  reopened_at timestamptz
);

-- period_monthは月初日(1日)で統一する運用とする。アプリ層で date_trunc('month', ...) して渡す。
create unique index settlement_periods_group_period_uniq
  on public.settlement_periods (group_id, period_month);

create index settlement_periods_group_id_idx on public.settlement_periods (group_id);

alter table public.settlement_periods enable row level security;

-- 所属グループのメンバーなら参照可。確定・再オープンともにRPC経由に限定するため、
-- 直接INSERT/UPDATEポリシーは設けない（groups/group_membersと同じ思想）。
create policy "member can read own group settlement_periods"
  on public.settlement_periods for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

-- 指定グループ・指定日時の月がすでに精算確定済み（status='confirmed'）かどうかを判定する。
-- receipts/receipt_detailsの書き込みポリシーから参照し、確定済み月への
-- 追加・変更・削除をDBレベルでブロックする。
create or replace function public.is_settlement_confirmed(p_group_id uuid, p_occurred_at timestamptz)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.settlement_periods
    where group_id = p_group_id
      and period_month = date_trunc('month', p_occurred_at)::date
      and status = 'confirmed'
  );
$$;

revoke all on function public.is_settlement_confirmed(uuid, timestamptz) from public;
grant execute on function public.is_settlement_confirmed(uuid, timestamptz) to authenticated;
