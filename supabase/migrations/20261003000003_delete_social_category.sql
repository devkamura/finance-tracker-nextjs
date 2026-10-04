-- 分析拡充：カテゴリ「交際費」を削除する（docs/分析拡充/要件定義書.md・基本設計書.md 4.1節）。
-- 交際は今後「相手＝友人」などで表すため、カテゴリとしては持たない。

-- 既存の交際費の明細は「その他」に移す。
-- 交際費の内訳は「その他」の内訳ではないため、内訳は外す（内訳のトリガーで弾かれないように同時に更新する）。
update public.receipt_details
  set category_id = (select id from public.categories where name = 'その他'),
      breakdown_id = null
  where category_id = (select id from public.categories where name = '交際費');

-- カテゴリの設定・内訳は on delete cascade で一緒に消える
delete from public.categories where name = '交際費';
