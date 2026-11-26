-- 家計相談（Issue #49）：月ごとの合計。fp-consult-export.sql（明細の一覧）の金額が、分析画面と一致するかの確認用。
-- Supabase ダッシュボードの SQL Editor で実行する。読み取りだけで、データは変えない。
-- 金額の求め方は fp-consult-export.sql と同じ（docs/全体仕様書/用語と算出方法.md 2〜3章）。
-- 下の params の「表示名」「開始日」「終了日の翌日」を、fp-consult-export.sql と同じ値にする。
-- 分析画面で「表示対象：本人・共同を含める（1/2）」にしたときの推移グラフの金額と一致する。
--   特別費を除く   ＝ 「特別費を含める」オフ
--   特別費を含む   ＝ 「特別費を含める」オン
with params as (
  select
    'ゆうき'::text                          as member_name,
    timestamptz '2026-08-01 00:00:00+09'   as period_from,
    timestamptz '2026-11-01 00:00:00+09'   as period_to
),
me as (
  select p.id as user_id, gm.group_id
  from public.profiles p
  join public.group_members gm on gm.user_id = p.id
  join params on p.display_name = params.member_name
),
base as (
  select
    r.id as receipt_id, r.occurred_at, r.amount, (tt.name = '返金') as is_refund,
    d.id as detail_id, d.created_at as detail_created_at, d.owner_user_id, d.is_special_expense,
    case when d.tax_type = 'inclusive' then d.price
         else floor(d.price * ct.multiplier)::bigint end as base_amount
  from public.receipts r
  join me on me.group_id = r.group_id
  join params on true
  join public.transaction_types tt on tt.id = r.transaction_type_id
  join public.receipt_details d on d.receipt_id = r.id
  left join public.consumption_taxes ct on ct.id = d.tax_rate_id
  where r.occurred_at >= params.period_from and r.occurred_at < params.period_to
),
floored as (
  select b.*,
    sum(b.base_amount) over (partition by b.receipt_id) as receipt_base_total,
    case when sum(b.base_amount) over (partition by b.receipt_id) = 0 then 0
         else floor(b.amount::numeric * b.base_amount
                    / sum(b.base_amount) over (partition by b.receipt_id))::bigint end as floor_amount,
    row_number() over (partition by b.receipt_id
                       order by b.base_amount desc, b.detail_created_at, b.detail_id) as remainder_rank
  from base b
),
allocated as (
  select f.*,
    (f.floor_amount
      + case when f.receipt_base_total > 0
              and f.remainder_rank <= f.amount - sum(f.floor_amount) over (partition by f.receipt_id)
             then 1 else 0 end
    ) * case when f.is_refund then -1 else 1 end as signed_amount
  from floored f
),
weighted as (
  select
    to_char(a.occurred_at at time zone 'Asia/Tokyo', 'YYYY-MM') as month,
    a.is_special_expense,
    a.signed_amount,
    a.signed_amount * case when a.owner_user_id = me.user_id then 1.0
                           when a.owner_user_id is null then 0.5 else 0 end as my_amount
  from allocated a join me on true
)
select
  month                                                          as 月,
  sum(signed_amount) filter (where not is_special_expense)       as 全体_特別費を除く,
  sum(signed_amount)                                             as 全体_特別費を含む,
  sum(my_amount) filter (where not is_special_expense)           as 本人_特別費を除く,
  sum(my_amount)                                                 as 本人_特別費を含む,
  sum(my_amount) filter (where is_special_expense)               as 本人_特別費のみ
from weighted
group by month
order by month;
