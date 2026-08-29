-- 元となるDjango版の実データ（src/fixtures/initial_data.json）を移植。
-- 「該当なし」はUI側の定数として扱うためここには含めない。
-- storesはグループ単位のデータになったため、ここでのシードは行わない。
-- 各グループの管理者が /admin/stores から必要な店舗を登録する。

insert into public.transaction_types (name) values
  ('支出'),
  ('返金')
on conflict (name) do nothing;

insert into public.consumption_taxes (name, multiplier) values
  ('税込', 1.00),
  ('税別(8%)', 1.08),
  ('税別(10%)', 1.10),
  ('税なし', 1.00)
on conflict (name) do update set multiplier = excluded.multiplier;

insert into public.categories (name) values
  ('食費'),
  ('交通費'),
  ('医療費'),
  ('娯楽'),
  ('日用品'),
  ('宿泊・旅行'),
  ('学習・自己投資'),
  ('その他')
on conflict (name) do nothing;

insert into public.purposes (name) values
  ('個人'),
  ('交際費'),
  ('仕事'),
  ('家族'),
  ('生活維持')
on conflict (name) do nothing;

insert into public.scenes (name) values
  ('朝食'),
  ('昼食'),
  ('夕食'),
  ('間食'),
  ('飲み物'),
  ('副業'),
  ('飲み会'),
  ('デート'),
  ('趣味'),
  ('通院・薬局'),
  ('宿泊')
on conflict (name) do nothing;
