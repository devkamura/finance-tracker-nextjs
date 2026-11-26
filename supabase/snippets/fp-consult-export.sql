-- 家計相談（Issue #49）用に、明細を CSV で書き出す。
-- Supabase ダッシュボードの SQL Editor で実行し、結果を CSV でダウンロードする。読み取りだけで、データは変えない。
--
-- 金額の求め方は docs/全体仕様書/用語と算出方法.md 2〜3章と同じ。
--   1. レシートの支払額を、明細の税込換算額（税別は floor(価格 × 税率)）の比率で按分する
--      （各明細を切り捨て、余りは税込換算額が大きい明細から1円ずつ足す）
--   2. 返金のレシートはマイナスにする
--   3. 「金額_本人」は、帰属先が本人の明細は全額、共同の明細は 1/2、相方の明細は 0
-- 店名・商品名は出さない（相談に必要なのは金額と分類だけのため）。
-- 投資（NISA・個別株など）はカテゴリ「投資」で見分ける（Issue #49）。
--
-- 使い方：下の params の「表示名」「開始日」「終了日の翌日」を書き換えて実行する。
--   本人の負担がない明細（相方だけの明細）は出さない。
--   月ごとの合計で分析画面と照らし合わせるときは fp-consult-monthly-check.sql を使う
--   （SQL Editor は複数のクエリを一度に実行すると最後の結果しか出さないため、ファイルを分けている）。
--
-- 注意：按分の端数（1円）の配り方は、税込換算額が同じ明細どうしの順番だけアプリと違うことがある（合計は同じ）。

-- ===== 明細の一覧 =====
with params as (
  select
    'ゆうき'::text                          as member_name,  -- 本人の表示名
    timestamptz '2026-08-01 00:00:00+09'   as period_from,  -- 開始日（この日を含む）
    timestamptz '2026-11-01 00:00:00+09'   as period_to     -- 終了日の翌日（この日を含まない）
),
me as (
  -- 本人と、本人が所属するグループ
  select p.id as user_id, gm.group_id
  from public.profiles p
  join public.group_members gm on gm.user_id = p.id
  join params on p.display_name = params.member_name
),
base as (
  -- 明細ごとの税込換算額（按分の基準）
  select
    r.id as receipt_id, r.group_id, r.occurred_at, r.amount, r.payer_user_id,
    (tt.name = '返金') as is_refund,
    d.id as detail_id, d.created_at as detail_created_at,
    d.category_id, d.breakdown_id, d.counterpart_id, d.owner_user_id, d.is_special_expense,
    case when d.tax_type = 'inclusive' then d.price
         else floor(d.price * ct.multiplier)::bigint end as base_amount
  from public.receipts r
  join me on me.group_id = r.group_id
  join params on true
  join public.transaction_types tt on tt.id = r.transaction_type_id
  join public.receipt_details d on d.receipt_id = r.id
  left join public.consumption_taxes ct on ct.id = d.tax_rate_id
  where r.occurred_at >= params.period_from
    and r.occurred_at <  params.period_to
),
floored as (
  -- 切り捨ての按分額と、余りを配る順番
  select
    b.*,
    sum(b.base_amount) over (partition by b.receipt_id) as receipt_base_total,
    case when sum(b.base_amount) over (partition by b.receipt_id) = 0 then 0
         else floor(b.amount::numeric * b.base_amount
                    / sum(b.base_amount) over (partition by b.receipt_id))::bigint end as floor_amount,
    row_number() over (partition by b.receipt_id
                       order by b.base_amount desc, b.detail_created_at, b.detail_id) as remainder_rank
  from base b
),
allocated as (
  select
    f.*,
    (f.floor_amount
      + case when f.receipt_base_total > 0
              and f.remainder_rank <= f.amount - sum(f.floor_amount) over (partition by f.receipt_id)
             then 1 else 0 end
    ) * case when f.is_refund then -1 else 1 end as signed_amount
  from floored f
)
select
  to_char(a.occurred_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as 日付,
  to_char(a.occurred_at at time zone 'Asia/Tokyo', 'YYYY-MM')    as 月,
  c.name                                                        as カテゴリ,
  coalesce(cb.name, '')                                         as 内訳,
  -- 費用区分は、内訳の費用区分 → グループのカテゴリの設定 → カテゴリの初期値の順（Issue #49）
  case coalesce(cb.cost_type, cs.cost_type, c.default_cost_type)
       when 'fixed' then '固定費' else '変動費' end              as 費用区分,
  coalesce(cp.name, cpp.display_name, '')                       as 相手,
  case when a.owner_user_id is null then '共同'
       when a.owner_user_id = me.user_id then '本人'
       else '相方' end                                          as 帰属先,
  case when a.payer_user_id = me.user_id then '本人' else '相方' end as 支払者,
  case when a.is_special_expense then 1 else 0 end              as 特別費,
  case when a.is_refund then 1 else 0 end                       as 返金,
  coalesce((select string_agg(t.name, '・' order by t.sort_order, t.name)
            from public.receipt_detail_tags dt
            join public.tags t on t.id = dt.tag_id
            where dt.receipt_detail_id = a.detail_id), '')     as タグ,
  a.signed_amount                                               as 金額_全体,
  a.signed_amount * case when a.owner_user_id = me.user_id then 1.0
                         when a.owner_user_id is null then 0.5
                         else 0 end                             as 金額_本人
from allocated a
join me on true
join public.categories c on c.id = a.category_id
left join public.category_breakdowns cb on cb.id = a.breakdown_id
left join public.category_settings cs on cs.group_id = a.group_id and cs.category_id = a.category_id
left join public.counterparts cp on cp.id = a.counterpart_id
left join public.profiles cpp on cpp.id = cp.user_id
where a.owner_user_id is null or a.owner_user_id = me.user_id
order by a.occurred_at, a.receipt_id, a.remainder_rank;
