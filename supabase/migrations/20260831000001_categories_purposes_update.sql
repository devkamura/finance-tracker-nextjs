-- カテゴリ・目的を要件定義書（家計簿アプリ 要件定義書.md 4〜5章）に合わせて更新する。
-- 「交際費」は目的ではなくカテゴリとして扱う仕様に変更されたため、
-- purposesから削除しcategoriesへ追加する。目的には新たに「友人」を追加する。
-- レシート機能はまだDB化されていない（このマイグレーション時点でreceipt_details等は
-- 存在しない）ため、既存データへの参照は発生せず、安全に入れ替えられる。

insert into public.categories (name) values
  ('衣類・ファッション'),
  ('通信費'),
  ('賃料'),
  ('水道光熱費'),
  ('交際費')
on conflict (name) do nothing;

insert into public.purposes (name) values
  ('友人')
on conflict (name) do nothing;

delete from public.purposes where name = '交際費';
