-- 支払い先の一本化（20261011000001_payee_unify.sql）の移行の確認用データ（docs/test-spec.md I-54）。
-- 移行前のスキーマに、移行ルールの各パターンの支払い先を入れる。
-- 移行の適用前のDBで、トランザクションの中で実行し、最後にロールバックする（DBには何も残らない）：
--
--   (echo "begin;"; cat supabase/snippets/payee-unify-migration-check.before.sql \
--      supabase/migrations/20261011000001_payee_unify.sql \
--      supabase/snippets/payee-unify-migration-check.after.sql; echo "rollback;") \
--     | docker exec -i supabase_db_finance-tracker-nextjs psql -U postgres -d postgres -v ON_ERROR_STOP=1

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payee-unify-a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payee-unify-b@example.com');

insert into public.groups (id, name, created_by)
values ('00000000-0000-4000-8000-0000000000aa', '移行確認グループ', '00000000-0000-4000-8000-00000000000a');

-- A＝管理者、B＝一般メンバー
insert into public.group_members (group_id, user_id, role)
values
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', 'admin'),
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000b', 'member');

create temporary table chk (key text primary key, payee_id bigint);

do $$
declare
  g constant uuid := '00000000-0000-4000-8000-0000000000aa';
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  b constant uuid := '00000000-0000-4000-8000-00000000000b';
  v_food bigint := (select id from public.categories where name = '食費');
  v_daily bigint := (select id from public.categories where name = '日用品');
  v_type bigint := (select id from public.transaction_types where name = '支出');
  v_id bigint;
  v_tag bigint;
begin
  -- グループ全体／管理者の自分用／一般メンバーの自分用／グループ全体の非表示
  insert into public.payees (group_id, name) values (g, 'スーパー') returning id into v_id;
  insert into chk values ('shared', v_id);
  insert into public.payees (group_id, name, owner_user_id) values (g, 'A本屋', a) returning id into v_id;
  insert into chk values ('own_a', v_id);
  insert into public.payees (group_id, name, owner_user_id) values (g, 'B薬局', b) returning id into v_id;
  insert into chk values ('own_b', v_id);
  insert into public.payees (group_id, name, is_hidden) values (g, '閉店', true) returning id into v_id;
  insert into chk values ('hidden', v_id);

  -- 相方同士の自分用に同じ名前（既定値が違う。一般メンバーの方を先に登録して、id の順では残らないようにする）
  insert into public.payees (group_id, name, owner_user_id, default_category_id)
    values (g, '近所の店', b, v_daily) returning id into v_id;
  insert into chk values ('dup_b', v_id);
  -- 一般メンバーの方だけ既定値のタグがある（自分用の既定値に引き継がれることを確かめる）
  insert into public.tags (group_id, name) values (g, '移行確認タグ') returning id into v_tag;
  insert into public.payee_default_tags (payee_id, tag_id) values (v_id, v_tag);
  insert into public.payee_aliases (payee_id, group_id, name) values (v_id, g, '近所B');
  insert into public.receipts (id, group_id, payee_id, payee_name, transaction_type_id, occurred_at,
                               payer_user_id, created_by, amount, updated_at)
    values ('00000000-0000-4000-8000-0000000000b1', g, v_id, '近所の店', v_type, '2026-09-10T03:00:00Z',
            b, b, 1000, '2026-01-01T00:00:00Z');

  insert into public.payees (group_id, name, owner_user_id, default_category_id)
    values (g, '近所の店', a, v_food) returning id into v_id;
  insert into chk values ('dup_a', v_id);
  insert into public.payee_aliases (payee_id, group_id, name) values (v_id, g, '近所A');
  insert into public.receipts (id, group_id, payee_id, payee_name, transaction_type_id, occurred_at,
                               payer_user_id, created_by, amount, updated_at)
    values ('00000000-0000-4000-8000-0000000000a1', g, v_id, '近所の店', v_type, '2026-09-11T03:00:00Z',
            a, a, 2000, '2026-01-01T00:00:00Z');

  -- 同じ名前で、管理者の方だけが非表示（既定値はどちらもなし＝同じため、自分用の既定値は作らない）
  insert into public.payees (group_id, name, owner_user_id, is_hidden) values (g, '片方だけ非表示', a, true)
    returning id into v_id;
  insert into chk values ('half_a', v_id);
  insert into public.payees (group_id, name, owner_user_id) values (g, '片方だけ非表示', b);
end;
$$;
