-- ローカル開発用：レシート一覧のフィルタ（Issue #39）の受け入れテスト用に、2026年11月のレシートを6件入れる。
-- 対象：グループ「ぽてぽて」。A＝ゆうき、B＝ふみ。
-- 既存のデータは消さない。この6件だけ固定のIDで入れるので、何度流しても同じ6件に入れ替わるだけ
-- （あとから自分で登録したレシートは消えない）。
-- グループ・ユーザーのIDはローカル環境のもの。本番では絶対に流さないこと。
-- 実行：PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -f supabase/snippets/receipt-list-filter-dummy-data.sql
--
-- ===== 入れるレシート（支払者・帰属先：A＝ゆうき、B＝ふみ、共同） =====
-- | No | 日時（日本時間）| 支払い先           | 支払者 | 明細（帰属先）                                              | 支払額  |
-- | 1  | 11/2 18:00     | イオン             | ゆうき | 野菜・肉 3,000（共同）、ティッシュ 800（ゆうき）             | 3,800   |
-- | 2  | 11/5 15:00     | STARBUCKS 渋谷店   | ふみ   | カフェラテ 600（ふみ）                                      | 600     |
-- | 3  | 11/10 19:00    | マツモトキヨシ     | ふみ   | 目薬 1,000（ゆうき）、化粧水 1,500（ふみ）、洗剤 1,000 税別10%（共同）| 3,240（1割引） |
-- | 4  | 11/15 12:00    | サイゼリヤ         | ゆうき | ランチ 2,400（共同）                                        | 2,400   |
-- | 5  | 11/20 14:00    | ユニクロ（返金）   | ふみ   | ニット 2,000（ふみ）                                        | −2,000  |
-- | 6  | 11/24 23:30    | セブン-イレブン    | ゆうき | ホットコーヒー 150（ゆうき）                                | 150     |
--
-- No.3 は1枚に3人分が混ざるレシート。洗剤は税込 1,100。明細の税込合計 3,600 に対して支払額 3,240（0.9倍）なので、
-- 目薬 900・化粧水 1,350・洗剤 990 に按分される。
--
-- ===== 期待する結果（11月・合計 8,190円） =====
-- | 条件                         | 件数 | 合計    | 出るレシート      |
-- | 支払者：ゆうき               | 3    | 6,350   | 1・4・6          |
-- | 支払者：ふみ                 | 3    | 1,840   | 2・3・5          |
-- | 負担者：ゆうき               | 3    | 1,850   | 1・3・6（うち 800・900・150） |
-- | 負担者：ゆうき＋共同1/2      | 4    | 5,045   | 1・3・4・6（うち 2,300・1,395・1,200・150） |
-- | 負担者：ふみ                 | 3    | −50     | 2・3・5（うち 600・1,350・−2,000） |
-- | 負担者：ふみ＋共同1/2        | 5    | 3,145   | 1〜5（うち 1,500・600・1,845・1,200・−2,000） |
-- | 期間：11/1〜11/10            | 3    | 7,640   | 1・2・3          |
-- | 期間：11/24〜11/24           | 1    | 150     | 6（夜23:30でも11/24に入る） |
-- | キーワード：starbucks／ラテ  | 1    | 600     | 2（大文字・小文字、商品名でも当たる） |
-- | キーワード：洗剤             | 1    | 3,240   | 3                |
-- ゆうき＋共同1/2（5,045）とふみ＋共同1/2（3,145）の和は全体（8,190）になる。
\set ON_ERROR_STOP on
begin;

create temp table c as
select '52a106a6-e139-4568-992d-048a09e5c2a8'::uuid as g,
       '069541a9-4c3f-4301-8a1e-999ef370d9fd'::uuid as a,
       'e55bccdd-54f4-41ff-9185-39c9f6d74338'::uuid as b;

-- この6件のID（固定）
create temp table ids as
select v.no, v.id::uuid as id
from (values
  (1, '11000000-0000-4000-8000-000000000001'),
  (2, '11000000-0000-4000-8000-000000000002'),
  (3, '11000000-0000-4000-8000-000000000003'),
  (4, '11000000-0000-4000-8000-000000000004'),
  (5, '11000000-0000-4000-8000-000000000005'),
  (6, '11000000-0000-4000-8000-000000000006')
) as v(no, id);

-- 前回入れた6件だけを消す
delete from receipt_detail_tags where receipt_detail_id in (
  select id from receipt_details where receipt_id in (select id from ids));
delete from receipt_details where receipt_id in (select id from ids);
delete from receipts where id in (select id from ids);

-- ===== 名前 → ID の補助関数 =====
create function pg_temp.cat(p text) returns bigint language sql as $$ select id from categories where name = p $$;
create function pg_temp.bd(p_cat text, p text) returns bigint language sql as $$
  select id from category_breakdowns where group_id = (select g from c) and category_id = pg_temp.cat(p_cat) and name = p $$;
-- 相手：'A'・'B' はメンバー、それ以外は名前
create function pg_temp.cp(p text) returns bigint language sql as $$
  select id from counterparts where group_id = (select g from c) and (
    (p = 'A' and kind = 'member' and user_id = (select a from c)) or
    (p = 'B' and kind = 'member' and user_id = (select b from c)) or
    (p not in ('A', 'B') and name = p)) $$;
create function pg_temp.usr(p text) returns uuid language sql as $$
  select case p when 'A' then (select a from c) when 'B' then (select b from c) end $$;

-- 明細：[品目, 金額, カテゴリ, 内訳('' 可), 相手, 帰属先('joint'|'A'|'B'), 税('in'|'ex8'|'ex10')]
-- p_amount を省略すると、明細の税込の合計を支払額にする。
create function pg_temp.receipt(p_no int, p_at timestamptz, p_payee text, p_payer text, p_items text[][],
                                p_refund boolean default false, p_amount integer default null)
returns void language plpgsql as $$
declare
  v_receipt uuid := (select id from ids where no = p_no);
  v_total numeric := 0;
  v_item text[];
  v_tax_id bigint;
  v_mult numeric;
begin
  -- 支払い先：登録済みの名前ならIDも入れる（なければ手入力の扱い）
  insert into receipts (id, group_id, payee_id, payee_name, transaction_type_id, occurred_at,
                        payer_user_id, created_by, amount)
  values (v_receipt, (select g from c),
          (select id from payees where group_id = (select g from c) and name = p_payee), p_payee,
          (select id from transaction_types where name = case when p_refund then '返金' else '支出' end),
          p_at, pg_temp.usr(p_payer), pg_temp.usr(p_payer), 1);  -- 支払額は明細を入れたあとで更新する

  foreach v_item slice 1 in array p_items loop
    v_tax_id := case v_item[7] when 'ex8' then (select id from consumption_taxes where name = '8%')
                               when 'ex10' then (select id from consumption_taxes where name = '10%') end;
    v_mult := coalesce((select multiplier from consumption_taxes where id = v_tax_id), 1);
    v_total := v_total + floor(v_item[2]::int * v_mult);
    insert into receipt_details (receipt_id, item_name, price, tax_type, tax_rate_id, category_id,
                                 breakdown_id, counterpart_id, owner_user_id)
    values (v_receipt, v_item[1], v_item[2]::int,
            case when v_tax_id is null then 'inclusive' else 'exclusive' end, v_tax_id,
            pg_temp.cat(v_item[3]),
            case when v_item[4] = '' then null else pg_temp.bd(v_item[3], v_item[4]) end,
            pg_temp.cp(v_item[5]),
            case when v_item[6] = 'joint' then null else pg_temp.usr(v_item[6]) end);
  end loop;

  update receipts set amount = coalesce(p_amount, v_total::int) where id = v_receipt;
end $$;

-- ===== レシート（6件） =====
select pg_temp.receipt(1, '2026-11-02 18:00+09', 'イオン', 'A',
  array[['野菜・肉', '3000', '食費', '自炊', 'ふたり', 'joint', 'in'],
        ['ティッシュ', '800', '日用品', '', 'A', 'A', 'in']]);
select pg_temp.receipt(2, '2026-11-05 15:00+09', 'STARBUCKS 渋谷店', 'B',
  array[['カフェラテ', '600', '食費', '', 'B', 'B', 'in']]);
-- 1枚に ゆうき・ふみ・共同 の明細が混ざる。税込合計 3,600 → 1割引で 3,240（900・1,350・990 に按分）
select pg_temp.receipt(3, '2026-11-10 19:00+09', 'マツモトキヨシ', 'B',
  array[['目薬', '1000', '医療費', '', 'A', 'A', 'in'],
        ['化粧水', '1500', '日用品', '', 'B', 'B', 'in'],
        ['洗剤', '1000', '日用品', '', 'ふたり', 'joint', 'ex10']],
  false, 3240);
select pg_temp.receipt(4, '2026-11-15 12:00+09', 'サイゼリヤ', 'A',
  array[['ランチ', '2400', '食費', '外食', 'ふたり', 'joint', 'in']]);
select pg_temp.receipt(5, '2026-11-20 14:00+09', 'ユニクロ', 'B',
  array[['ニット（返品）', '2000', '衣類・ファッション', '', 'B', 'B', 'in']],
  true);
-- 期間の境界の確認用（日本時間の夜遅く）
select pg_temp.receipt(6, '2026-11-24 23:30+09', 'セブン-イレブン', 'A',
  array[['ホットコーヒー', '150', '食費', '', 'A', 'A', 'in']]);

commit;
