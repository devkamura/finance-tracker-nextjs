-- ローカル開発用：ユーザー・グループ以外のデータを消して、テスト用のダミーデータを入れる。
-- 対象：グループ「ぽてぽて」。A＝ゆうき（管理者）、B＝ふみ（一般メンバー）。
-- 期間：分析の12ヶ月（2025-11〜2026-10）のうち、2025-12・2026-06〜09 の5ヶ月にレシート19件。何度流しても同じデータになる。
-- データの中身と集計の計算は docs/分析拡充/テストデータ.md。手動テスト仕様書（F4）の期待結果もこのデータの金額で書いている。
-- グループ・ユーザーのIDはローカル環境のもの。本番では絶対に流さないこと。
-- 実行：PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -f supabase/snippets/analytics-dummy-data.sql
\set ON_ERROR_STOP on
begin;

-- ===== 定数 =====
create temp table c as
select '52a106a6-e139-4568-992d-048a09e5c2a8'::uuid as g,
       '069541a9-4c3f-4301-8a1e-999ef370d9fd'::uuid as a,
       'e55bccdd-54f4-41ff-9185-39c9f6d74338'::uuid as b;

-- ===== 削除（ユーザー・プロフィール・グループ・メンバー・アプリ共通のマスタは残す） =====
delete from receipt_detail_tags where receipt_detail_id in (
  select d.id from receipt_details d join receipts r on r.id = d.receipt_id where r.group_id = (select g from c));
delete from receipt_details where receipt_id in (select id from receipts where group_id = (select g from c));
delete from receipts where group_id = (select g from c);
delete from settlement_periods where group_id = (select g from c);
delete from payee_default_tags where payee_id in (select id from payees where group_id = (select g from c));
delete from payees where group_id = (select g from c);
delete from tags where group_id = (select g from c);
delete from counterparts where group_id = (select g from c) and kind = 'custom';
update counterparts set is_hidden = false where group_id = (select g from c);
delete from category_breakdowns where group_id = (select g from c);
delete from category_settings where group_id = (select g from c);

-- ===== マスタ（グループごと） =====
-- 内訳。娯楽は内訳が1つだけ（自動選択の確認用）
insert into category_breakdowns (group_id, category_id, name, sort_order)
select (select g from c), cat.id, v.name, v.ord
from (values
  ('食費', '自炊', 1), ('食費', '外食', 2), ('食費', '間食', 3),
  ('日用品', '消耗品', 1), ('日用品', '掃除・洗濯', 2),
  ('交通費', '電車・バス', 1), ('交通費', 'タクシー', 2),
  ('水道光熱費', '電気', 1), ('水道光熱費', 'ガス', 2), ('水道光熱費', '水道', 3),
  ('娯楽', '趣味', 1)
) as v(cat, name, ord)
join categories cat on cat.name = v.cat;

-- 費用区分：学習・自己投資（サブスク）だけグループで固定費に変える
insert into category_settings (group_id, category_id, cost_type)
select (select g from c), id, 'fixed' from categories where name = '学習・自己投資';

-- 任意の相手
insert into counterparts (group_id, kind, name, sort_order)
values ((select g from c), 'custom', '同僚', 4);

-- タグ
insert into tags (group_id, name, sort_order)
select (select g from c), v.name, v.ord
from (values ('夕食', 1), ('サブスク', 2), ('旅行', 3)) as v(name, ord);

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
create function pg_temp.tag(p text) returns bigint language sql as $$
  select id from tags where group_id = (select g from c) and name = p $$;

-- ===== 支払い先 =====
-- owner：null＝グループ全体、'A'／'B'＝自分用。既定の帰属先：'joint'＝共同、'A'／'B'、null＝設定しない
create function pg_temp.payee(p_name text, p_owner text, p_cat text, p_bd text, p_cp text,
                              p_downer text, p_tags text[] default '{}', p_hidden boolean default false)
returns void language plpgsql as $$
declare v_id bigint;
begin
  insert into payees (group_id, name, owner_user_id, is_hidden, default_category_id, default_breakdown_id,
                      default_counterpart_id, default_owner_joint, default_owner_user_id)
  values ((select g from c), p_name, pg_temp.usr(p_owner), p_hidden, pg_temp.cat(p_cat),
          case when p_bd is null then null else pg_temp.bd(p_cat, p_bd) end,
          case when p_cp is null then null else pg_temp.cp(p_cp) end,
          coalesce(p_downer = 'joint', false),
          case when p_downer in ('A', 'B') then pg_temp.usr(p_downer) end)
  returning id into v_id;
  insert into payee_default_tags (payee_id, tag_id) select v_id, pg_temp.tag(t) from unnest(p_tags) t;
end $$;

-- レシートで使う支払い先と、設定画面の確認用（非表示・自分用）だけを登録する
select pg_temp.payee('〇〇不動産',     null, '賃料',       null,   'ふたり', 'joint');
select pg_temp.payee('東京電力',       null, '水道光熱費', '電気', 'ふたり', 'joint');
select pg_temp.payee('イオン',         null, '食費',       '自炊', 'ふたり', 'joint');
select pg_temp.payee('スターバックス', null, '食費',       '間食', null,     null);
select pg_temp.payee('居酒屋とりきん', null, '食費',       '外食', '友人',   null, array['夕食']);
select pg_temp.payee('ガスト',         null, '食費',       '外食', 'ふたり', 'joint');
select pg_temp.payee('マツモトキヨシ', null, null,         null,   null,     null);   -- 既定値なし
select pg_temp.payee('A病院',          null, '医療費',     null,   null,     null);
select pg_temp.payee('ユニクロ',       null, '衣類・ファッション', null, null, null);
select pg_temp.payee('旧スーパー',     null, null,         null,   null,     null, '{}', true);  -- 非表示
-- 自分用
select pg_temp.payee('Udemy',          'A',  '学習・自己投資', null, 'A',    'A', array['サブスク']);
select pg_temp.payee('ヨガ教室',       'B',  '娯楽',       '趣味', 'B',      'B');

-- ===== レシート =====
-- 明細：[品目, 金額, カテゴリ, 内訳(null可), 相手, 帰属先('joint'|'A'|'B'), 税('in'|'ex8'|'ex10'), タグ(カンマ区切り)]
-- p_amount を省略すると、明細の税込の合計を支払額にする。
create function pg_temp.receipt(p_at timestamptz, p_payee text, p_payer text, p_items text[][],
                                p_refund boolean default false, p_amount integer default null)
returns void language plpgsql as $$
declare
  v_receipt uuid := gen_random_uuid();
  v_detail uuid;
  v_total numeric := 0;
  v_item text[];
  v_tax_id bigint;
  v_mult numeric;
  v_tag text;
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
            case when v_item[4] is null or v_item[4] = '' then null else pg_temp.bd(v_item[3], v_item[4]) end,
            pg_temp.cp(v_item[5]),
            case when v_item[6] = 'joint' then null else pg_temp.usr(v_item[6]) end)
    returning id into v_detail;
    if v_item[8] is not null and v_item[8] <> '' then
      foreach v_tag in array string_to_array(v_item[8], ',') loop
        insert into receipt_detail_tags (receipt_detail_id, tag_id) values (v_detail, pg_temp.tag(v_tag));
      end loop;
    end if;
  end loop;

  update receipts set amount = coalesce(p_amount, v_total::int) where id = v_receipt;
end $$;

-- ===== レシート（19件。中身と集計の計算は docs/分析拡充/テストデータ.md） =====
-- 支払者・帰属先：A＝ゆうき、B＝ふみ、joint＝共同

-- 2026年9月（10件）：合計 100,000円（固定費 80,000円＋変動費 20,000円）
select pg_temp.receipt('2026-09-27 10:00+09', '〇〇不動産', 'A',
  array[['家賃', '70000', '賃料', '', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt('2026-09-15 09:00+09', '東京電力', 'B',
  array[['電気代', '8000', '水道光熱費', '電気', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt('2026-09-03 07:00+09', 'Udemy', 'A',
  array[['オンライン講座', '2000', '学習・自己投資', '', 'A', 'A', 'in', 'サブスク']]);
select pg_temp.receipt('2026-09-10 18:00+09', 'イオン', 'B',
  array[['野菜・肉', '6000', '食費', '自炊', 'ふたり', 'joint', 'in', ''],
        ['ティッシュ', '1000', '日用品', '消耗品', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt('2026-09-18 20:00+09', '居酒屋とりきん', 'A',
  array[['飲み会', '2000', '食費', '外食', '友人', 'A', 'in', '夕食']]);
select pg_temp.receipt('2026-09-22 12:00+09', 'ガスト', 'B',
  array[['ランチ', '1000', '食費', '外食', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt('2026-09-07 15:00+09', 'スターバックス', 'B',
  array[['ラテ', '1000', '食費', '間食', 'B', 'B', 'in', '']]);
select pg_temp.receipt('2026-09-13 19:00+09', 'マツモトキヨシ', 'B',
  array[['洗剤', '1000', '日用品', '掃除・洗濯', 'ふたり', 'joint', 'in', ''],
        ['目薬', '1000', '医療費', '', 'B', 'B', 'in', '']]);
select pg_temp.receipt('2026-09-09 10:00+09', 'A病院', 'A',
  array[['診察代', '2000', '医療費', '', 'A', 'A', 'in', '']]);
select pg_temp.receipt('2026-09-11 14:00+09', 'ユニクロ', 'B',
  array[['シャツ', '5000', '衣類・ファッション', '', 'B', 'B', 'in', '']]);

-- 2026年8月（3件）：税別の明細の按分
select pg_temp.receipt('2026-08-27 10:00+09', '〇〇不動産', 'A',
  array[['家賃', '70000', '賃料', '', 'ふたり', 'joint', 'in', '']]);
-- 箱根の旅館：税別 40,000×1.10＝44,000、10,000×1.10＝11,000（合計 55,000）に対して、
-- クーポンで支払額 49,500 → 0.9倍に按分（宿泊 39,600・夕食 9,900）
select pg_temp.receipt('2026-08-10 15:00+09', '箱根の旅館', 'A',
  array[['宿泊（2名）', '40000', '宿泊・旅行', '', 'ふたり', 'joint', 'ex10', '旅行'],
        ['夕食の追加', '10000', '食費', '外食', 'ふたり', 'joint', 'ex10', '旅行']],
  false, 49500);
-- イオン：明細ごとに税込にして切り捨てると 156＋264＋1,100＝1,520 だが、お店は8%の小計
-- （145＋245＝390）に税をかけるため 390×1.08＝421.2→421、支払額は 421＋1,100＝1,521（1円多い）。
-- 端数の1円は金額の大きい洗剤に足す（牛乳 156・パン 264・洗剤 1,101）
select pg_temp.receipt('2026-08-28 18:00+09', 'イオン', 'B',
  array[['牛乳（税別8%）', '145', '食費', '自炊', 'ふたり', 'joint', 'ex8', ''],
        ['パン（税別8%）', '245', '食費', '自炊', 'ふたり', 'joint', 'ex8', ''],
        ['洗剤（税別10%）', '1000', '日用品', '掃除・洗濯', 'ふたり', 'joint', 'ex10', '']],
  false, 1521);

-- 2026年7月（2件）：内訳「タクシー」はこの月だけ
select pg_temp.receipt('2026-07-27 10:00+09', '〇〇不動産', 'A',
  array[['家賃', '70000', '賃料', '', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt('2026-07-18 23:40+09', '日本交通', 'A',
  array[['タクシー', '3000', '交通費', 'タクシー', 'A', 'A', 'in', '']]);

-- 2026年6月（2件）：返品だけの衣類がマイナスになる
select pg_temp.receipt('2026-06-27 10:00+09', '〇〇不動産', 'A',
  array[['家賃', '70000', '賃料', '', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt('2026-06-02 13:00+09', 'ユニクロ', 'A',
  array[['コート（返品）', '5000', '衣類・ファッション', '', 'A', 'A', 'in', '']], true);

-- 2025年12月（2件）：内訳を作る前のレシート（食費が「内訳なし」）と、相手「実家」
select pg_temp.receipt('2025-12-10 18:00+09', 'イオン', 'B',
  array[['野菜・肉', '6000', '食費', '', 'ふたり', 'joint', 'in', '']]);
select pg_temp.receipt('2025-12-28 14:00+09', '東京駅 銘品館', 'A',
  array[['手土産', '5000', 'その他', '', '実家', 'joint', 'in', '']]);
commit;

-- ===== 結果 =====
select '支払い先' as 項目, count(*) from payees where group_id = '52a106a6-e139-4568-992d-048a09e5c2a8'
union all select 'レシート', count(*) from receipts where group_id = '52a106a6-e139-4568-992d-048a09e5c2a8'
union all select '明細', count(*) from receipt_details d join receipts r on r.id = d.receipt_id
  where r.group_id = '52a106a6-e139-4568-992d-048a09e5c2a8'
union all select '明細×タグ', count(*) from receipt_detail_tags;
