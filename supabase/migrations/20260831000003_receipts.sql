-- レシート・明細をDBに保存する。従来の「管理者のGoogle DriveへJSONアップロード」に
-- 代わる、コア機能のデータモデル（docs/basic-design.md 2章参照）。

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  store_id bigint references public.stores (id),
  store_name text not null,
  transaction_type_id bigint not null references public.transaction_types (id),
  occurred_at timestamptz not null,
  -- 支払者は常に登録者本人（=created_by）と同じ値を自動設定する。列を分離しているのは
  -- 要件定義書14章の概念整理（支払者と帰属先の分離）に合わせるためで、
  -- 将来「代理登録」を許容する場合はこのcheck制約を緩める。
  payer_user_id uuid not null references auth.users (id),
  created_by uuid not null references auth.users (id),
  -- 支払額（実支払額）。要件定義書「明細金額・実支払額・精算に関する要件」6章のとおり、
  -- レシートの金額項目はこの1つのみとする。常に正の値で保存し、
  -- 返金かどうかはtransaction_type_idで判定する（符号反転は集計時にのみ行う）。
  amount integer not null check (amount >= 0),
  receipt_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipts_payer_is_creator check (payer_user_id = created_by)
);

create index receipts_group_id_idx on public.receipts (group_id);
create index receipts_group_occurred_at_idx on public.receipts (group_id, occurred_at);

create trigger receipts_set_updated_at
  before update on public.receipts
  for each row
  execute function public.set_updated_at();

create table public.receipt_details (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  item_name text not null,
  price integer not null check (price >= 0),
  tax_type text not null check (tax_type in ('inclusive', 'exclusive')),
  tax_rate_id bigint references public.consumption_taxes (id),
  category_id bigint not null references public.categories (id),
  purpose_id bigint not null references public.purposes (id),
  -- 帰属先。NULL＝共同、特定ユーザー＝そのユーザー個人。
  owner_user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_details_tax_rate_matches_type check (
    (tax_type = 'exclusive' and tax_rate_id is not null)
    or (tax_type = 'inclusive' and tax_rate_id is null)
  )
);

create index receipt_details_receipt_id_idx on public.receipt_details (receipt_id);

create trigger receipt_details_set_updated_at
  before update on public.receipt_details
  for each row
  execute function public.set_updated_at();

create table public.receipt_detail_scenes (
  receipt_detail_id uuid not null references public.receipt_details (id) on delete cascade,
  scene_id bigint not null references public.scenes (id),
  primary key (receipt_detail_id, scene_id)
);

alter table public.receipts enable row level security;
alter table public.receipt_details enable row level security;
alter table public.receipt_detail_scenes enable row level security;

-- receipts: 所属グループのメンバーなら誰でも読み書き可能（店舗管理と異なり管理者限定にしない。
-- 2人とも自分の支出を登録する必要があるため）。ただし確定済み月は書き込み不可。
create policy "member can read own group receipts"
  on public.receipts for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

create policy "member can write own group receipts"
  on public.receipts for all
  to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (
    group_id in (select public.my_group_ids())
    and not public.is_settlement_confirmed(group_id, occurred_at)
  );

-- receipt_details / receipt_detail_scenes は receipts 経由でグループ判定・確定判定する。
create policy "member can read own group receipt_details"
  on public.receipt_details for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id
        and r.group_id in (select public.my_group_ids())
    )
  );

create policy "member can write own group receipt_details"
  on public.receipt_details for all
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id
        and r.group_id in (select public.my_group_ids())
    )
  )
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id
        and r.group_id in (select public.my_group_ids())
        and not public.is_settlement_confirmed(r.group_id, r.occurred_at)
    )
  );

create policy "member can read own group receipt_detail_scenes"
  on public.receipt_detail_scenes for select
  to authenticated
  using (
    exists (
      select 1 from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where d.id = receipt_detail_id
        and r.group_id in (select public.my_group_ids())
    )
  );

create policy "member can write own group receipt_detail_scenes"
  on public.receipt_detail_scenes for all
  to authenticated
  using (
    exists (
      select 1 from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where d.id = receipt_detail_id
        and r.group_id in (select public.my_group_ids())
    )
  )
  with check (
    exists (
      select 1 from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where d.id = receipt_detail_id
        and r.group_id in (select public.my_group_ids())
        and not public.is_settlement_confirmed(r.group_id, r.occurred_at)
    )
  );
