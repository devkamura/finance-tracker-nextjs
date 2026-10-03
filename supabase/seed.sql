-- 元となるDjango版の実データ（src/fixtures/initial_data.json）を移植。
-- 「該当なし」はUI側の定数として扱うためここには含めない。
-- payeesはグループ単位のデータになったため、ここでのシードは行わない。
-- 各グループのメンバーが設定画面（/settings/payees）から必要な支払い先を登録する。

insert into public.transaction_types (name) values
  ('支出'),
  ('返金')
on conflict (name) do nothing;

-- 税込／税別はreceipt_details.tax_typeで別軸管理するため、ここには税別時の
-- 税率のみを保持する（20260831000006_consumption_taxes_update.sql参照）。
insert into public.consumption_taxes (name, multiplier) values
  ('8%', 1.08),
  ('10%', 1.10)
on conflict (name) do update set multiplier = excluded.multiplier;

-- 家計簿アプリ要件定義書4章のカテゴリ一覧（交際費は分析拡充で削除。
-- 20261003000003_delete_social_category.sql参照）。
insert into public.categories (name) values
  ('食費'),
  ('日用品'),
  ('衣類・ファッション'),
  ('交通費'),
  ('通信費'),
  ('賃料'),
  ('水道光熱費'),
  ('娯楽'),
  ('宿泊・旅行'),
  ('医療費'),
  ('学習・自己投資'),
  ('その他')
on conflict (name) do nothing;

-- 目的・シーンは、グループごとの相手・タグに置き換えた（分析拡充 F2。
-- 20261003000004_counterparts_tags.sql参照）。既定の相手はグループ作成時に自動で作られる。
