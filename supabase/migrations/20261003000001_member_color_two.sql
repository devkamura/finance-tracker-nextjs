-- メンバーの色を12色からブルー／レッドの2色に絞る（docs/支出分析機能/詳細設計書.md 6.5節）。
-- 支出分析のグラフでカテゴリに12色を使うため、メンバーの色と紛れないようにする。
-- ブルー・レッド以外が設定されているメンバーは「未設定」に戻し、管理者に選び直してもらう。

update public.profiles
  set color = null
  where color is not null and color not in ('blue', 'red');

alter table public.profiles drop constraint profiles_color_check;

alter table public.profiles add constraint profiles_color_check
  check (color is null or color in ('blue', 'red'));
