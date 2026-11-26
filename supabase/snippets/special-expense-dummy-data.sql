-- ローカル開発用：特別費フラグ（Issue #41）の受け入れテスト用に、2026年11月の旅行のレシートを3件、
-- 精算の確認用に2026年7月のレシートを1件、特別費の一覧で月ごとに分かれるのを見るために9月・10月の特別費を1件ずつ入れる。
-- 対象：グループ「ぽてぽて」。A＝ゆうき、B＝ふみ。
-- 既存のデータは消さない。この6件だけ固定のIDで入れるので、何度流しても同じ6件に入れ替わるだけ。
-- グループ・ユーザーのIDはローカル環境のもの。本番では絶対に流さないこと。
-- 実行：PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -f supabase/snippets/special-expense-dummy-data.sql
-- 手順と期待値：docs/仕様書/#41_…/受け入れテスト仕様書.md
--
-- ===== 入れるレシート（★＝特別費） =====
-- | No | 日時（日本時間）| 支払い先   | 支払者 | 明細（カテゴリ・帰属先）                                       | 支払額 |
-- | 1  | 11/14 15:00    | 箱根の宿   | ゆうき | ★宿泊費 30,000（宿泊・旅行・共同）                            | 30,000 |
-- | 2  | 11/15 11:00    | 道の駅     | ふみ   | ★お土産 2,000（娯楽・ゆうき）、野菜 1,000（食費 ＞ 自炊・共同） | 3,000  |
-- | 3  | 11/16 18:00    | JR東海     | ゆうき | ★新幹線 14,000（交通費・共同）                                | 14,000 |
-- | 4  | 7/5 12:00      | 温泉旅館   | ゆうき | 宿泊費 20,000（宿泊・旅行・共同）※最初は通常。AT-15 で特別費にする | 20,000 |
-- | 5  | 10/12 13:00    | 結婚式場   | ふみ   | ★ご祝儀 30,000（その他・相手 友人・ふみ）                    | 30,000 |
-- | 6  | 9/20 14:00     | 家電量販店 | ゆうき | ★冷蔵庫 80,000（日用品・共同）                                | 80,000 |
--
-- ===== 期待する結果（11月。既存の明細はすべて通常のため、特別費はこの3件だけ） =====
-- | 表示対象         | 特別費（絞り込み：特別費） | 除く→含めるの増加 | 通常として増える分（No.2 の野菜） |
-- | 全体             | 46,000                        | 46,000            | 1,000                           |
-- | ゆうき＋共同1/2  | 24,000（15,000＋2,000＋7,000） | 24,000            | 500                             |
-- | ふみ＋共同1/2    | 22,000（15,000＋7,000）        | 22,000            | 500                             |
-- | ゆうき（共同なし）| 2,000                         | 2,000             | 0                               |
-- 精算：3件とも精算に含まれる（特別費に関係なく、宿泊費・新幹線の共同分の半分はふみの負担）。
--
-- ===== 期待する結果（直近12ヶ月の特別費。9月〜11月の No.1〜3・5・6） =====
-- | 表示対象         | 合計                                          | 一覧に出る月           |
-- | 全体             | 156,000（11月 46,000＋10月 30,000＋9月 80,000） | 11月・10月・9月         |
-- | ゆうき＋共同1/2  | 64,000（11月 24,000＋9月 40,000）              | 11月・9月（10月は出ない） |
-- | ふみ＋共同1/2    | 92,000（11月 22,000＋10月 30,000＋9月 40,000） | 11月・10月・9月         |
-- | ゆうき（共同なし）| 2,000（11月の お土産だけ）                     | 11月                   |
--
-- ===== 精算の確認用（7月。7月のレシートはこの1件だけで、7月の精算は未確定） =====
-- 12月は未来の月で精算画面を開けないため、レシートのない7月に入れる。
-- 最初は通常にしておく（直近12ヶ月の特別費 46,000円 などほかの期待値を変えないため）。
-- 精算画面（7月）：ふみ → ゆうき 10,000円（宿泊費 20,000 の共同分の半分）。
-- レシートを編集して「特別費」を付けても外しても、精算の金額は 10,000円のまま変わらない。
\set ON_ERROR_STOP on
begin;

create temp table c as
select '52a106a6-e139-4568-992d-048a09e5c2a8'::uuid as g,
       '069541a9-4c3f-4301-8a1e-999ef370d9fd'::uuid as a,
       'e55bccdd-54f4-41ff-9185-39c9f6d74338'::uuid as b;

-- この3件のID（固定）
create temp table ids as
select v.no, v.id::uuid as id
from (values
  (1, '12000000-0000-4000-8000-000000000001'),
  (2, '12000000-0000-4000-8000-000000000002'),
  (3, '12000000-0000-4000-8000-000000000003'),
  (4, '12000000-0000-4000-8000-000000000004'),
  (5, '12000000-0000-4000-8000-000000000005'),
  (6, '12000000-0000-4000-8000-000000000006')
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

-- 明細：[品目, 金額, カテゴリ, 内訳('' 可), 相手, 帰属先('joint'|'A'|'B'), 税('in'|'ex8'|'ex10'), 特別費('special'|'')]
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
                                 breakdown_id, counterpart_id, owner_user_id, is_special_expense)
    values (v_receipt, v_item[1], v_item[2]::int,
            case when v_tax_id is null then 'inclusive' else 'exclusive' end, v_tax_id,
            pg_temp.cat(v_item[3]),
            case when v_item[4] = '' then null else pg_temp.bd(v_item[3], v_item[4]) end,
            pg_temp.cp(v_item[5]),
            case when v_item[6] = 'joint' then null else pg_temp.usr(v_item[6]) end,
            v_item[8] = 'special');
  end loop;

  update receipts set amount = coalesce(p_amount, v_total::int) where id = v_receipt;
end $$;

-- ===== レシート（11月：3件） =====
select pg_temp.receipt(1, '2026-11-14 15:00+09', '箱根の宿', 'A',
  array[['宿泊費', '30000', '宿泊・旅行', '', 'ふたり', 'joint', 'in', 'special']]);
-- 1枚に特別費（お土産）と通常（野菜）が混ざる
select pg_temp.receipt(2, '2026-11-15 11:00+09', '道の駅', 'B',
  array[['お土産', '2000', '娯楽', '', 'ふたり', 'A', 'in', 'special'],
        ['野菜', '1000', '食費', '自炊', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt(3, '2026-11-16 18:00+09', 'JR東海', 'A',
  array[['新幹線', '14000', '交通費', '', 'ふたり', 'joint', 'in', 'special']]);

-- ===== レシート（7月：精算の確認用に1件だけ。最初は通常） =====
select pg_temp.receipt(4, '2026-07-05 12:00+09', '温泉旅館', 'A',
  array[['宿泊費', '20000', '宿泊・旅行', '', 'ふたり', 'joint', 'in', '']]);

-- ===== レシート（9月・10月：特別費の一覧で月ごとに分かれるのを見るため） =====
-- 10月：ふみ個人の特別費（ゆうきの表示対象では出ない）
select pg_temp.receipt(5, '2026-10-12 13:00+09', '結婚式場', 'B',
  array[['ご祝儀', '30000', 'その他', '', '友人', 'B', 'in', 'special']]);
-- 9月：共同の特別費（メンバーの表示対象では半分）
select pg_temp.receipt(6, '2026-09-20 14:00+09', '家電量販店', 'A',
  array[['冷蔵庫', '80000', '日用品', '', 'ふたり', 'joint', 'in', 'special']]);

commit;
