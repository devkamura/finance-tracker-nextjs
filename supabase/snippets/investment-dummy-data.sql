-- ローカル開発用：投資を見分ける機能（Issue #49）の受け入れテスト用に、2026年11月のレシートを3件入れる。
-- 対象：グループ「ぽてぽて」。A＝ゆうき、B＝ふみ。
-- 既存のデータは消さない。この3件だけ固定のIDで入れるので、何度流しても同じ3件に入れ替わるだけ。
-- グループ・ユーザーのIDはローカル環境のもの。本番では絶対に流さないこと。
-- マイグレーション 20261126000002_investment_category.sql（カテゴリ「投資」と内訳）を当ててから流す。
--
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -f supabase/snippets/investment-dummy-data.sql
--
-- | No | 日時          | 支払い先       | 支払者 | 明細                                   | 支払額 |
-- |----|---------------|----------------|--------|----------------------------------------|--------|
-- | 1  | 11/25 9:00    | テスト証券     | ゆうき | NISA 積立 30,000（投資 ＞ 積立（NISA）・ゆうき） | 30,000 |
-- | 2  | 11/20 10:00   | テスト証券     | ゆうき | 個別株 10,000（投資 ＞ 個別株・ゆうき）          | 10,000 |
-- | 3  | 11/18 18:00   | テストスーパー | ゆうき | 食材 5,000（食費・ゆうき）                       | 5,000  |
--
-- ===== 期待する結果（分析画面・11月・全体。11月はこの3件だけのとき） =====
-- | 条件                               | 金額                                   |
-- | 投資を含める：オフ（初期値）       | 合計 5,000（食費だけ）                  |
-- | 投資を含める：オン                 | 合計 45,000（投資 40,000＋食費 5,000）  |
-- | 絞り込み：カテゴリ＝投資・分ける：内訳 | 積立（NISA）30,000・個別株 10,000      |
-- | 投資を含める：オン・分ける：費用区分 | 固定費 30,000・変動費 15,000（個別株 10,000＋食費 5,000） |
-- 精算（11月）：3件とも支払者・帰属先がゆうきなので、ゆうきの負担額と実支払額が 45,000 ずつ増え、精算差額は変わらない。
\set ON_ERROR_STOP on
begin;

create temp table c as
select '52a106a6-e139-4568-992d-048a09e5c2a8'::uuid as g,
       '069541a9-4c3f-4301-8a1e-999ef370d9fd'::uuid as a;

-- この3件のID（固定）
create temp table ids as
select v.no, v.id::uuid as id
from (values
  (1, '13000000-0000-4000-8000-000000000001'),
  (2, '13000000-0000-4000-8000-000000000002'),
  (3, '13000000-0000-4000-8000-000000000003')
) as v(no, id);

-- 前回入れた3件だけを消す
delete from receipt_detail_tags where receipt_detail_id in (
  select id from receipt_details where receipt_id in (select id from ids));
delete from receipt_details where receipt_id in (select id from ids);
delete from receipts where id in (select id from ids);

-- ===== 名前 → ID の補助関数 =====
create function pg_temp.cat(p text) returns bigint language sql as $$ select id from categories where name = p $$;
create function pg_temp.bd(p_cat text, p text) returns bigint language sql as $$
  select id from category_breakdowns where group_id = (select g from c) and category_id = pg_temp.cat(p_cat) and name = p $$;
-- 相手：ゆうき（メンバーの相手）
create function pg_temp.me() returns bigint language sql as $$
  select id from counterparts where group_id = (select g from c) and kind = 'member' and user_id = (select a from c) $$;

-- レシート1件・明細1件（税込・支払者・帰属先ともゆうき）
create function pg_temp.receipt(p_no int, p_at timestamptz, p_payee text, p_item text, p_price int,
                                p_cat text, p_bd text)
returns void language plpgsql as $$
declare
  v_receipt uuid := (select id from ids where no = p_no);
begin
  insert into receipts (id, group_id, payee_id, payee_name, transaction_type_id, occurred_at,
                        payer_user_id, created_by, amount)
  values (v_receipt, (select g from c),
          (select id from payees where group_id = (select g from c) and name = p_payee), p_payee,
          (select id from transaction_types where name = '支出'),
          p_at, (select a from c), (select a from c), p_price);
  insert into receipt_details (receipt_id, item_name, price, tax_type, category_id, breakdown_id,
                               counterpart_id, owner_user_id)
  values (v_receipt, p_item, p_price, 'inclusive', pg_temp.cat(p_cat),
          case when p_bd is null then null else pg_temp.bd(p_cat, p_bd) end,
          pg_temp.me(), (select a from c));
end $$;

-- ===== レシート（11月：3件） =====
select pg_temp.receipt(1, '2026-11-25 09:00+09', 'テスト証券', 'NISA 積立', 30000, '投資', '積立（NISA）');
select pg_temp.receipt(2, '2026-11-20 10:00+09', 'テスト証券', '個別株', 10000, '投資', '個別株');
select pg_temp.receipt(3, '2026-11-18 18:00+09', 'テストスーパー', '食材', 5000, '食費', null);

-- 内訳が見つからなかった（マイグレーション未適用など）ときは止める
do $$
begin
  if exists (
    select 1 from receipt_details d
    where d.receipt_id in (select id from ids) and d.category_id = pg_temp.cat('投資') and d.breakdown_id is null
  ) then
    raise exception '投資の内訳が見つかりません。マイグレーション 20261126000002 を当ててください';
  end if;
end $$;

commit;

-- 確認
select r.occurred_at at time zone 'Asia/Tokyo' as 日時, r.payee_name as 支払い先, d.item_name as 明細,
       c.name as カテゴリ, b.name as 内訳, d.price as 金額
from receipts r
join receipt_details d on d.receipt_id = r.id
join categories c on c.id = d.category_id
left join category_breakdowns b on b.id = d.breakdown_id
where r.id in ('13000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002',
               '13000000-0000-4000-8000-000000000003')
order by r.occurred_at;
