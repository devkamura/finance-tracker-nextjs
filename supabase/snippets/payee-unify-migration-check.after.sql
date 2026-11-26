-- 支払い先の一本化の移行結果を確かめる（docs/test-spec.md I-54）。
-- payee-unify-migration-check.before.sql → マイグレーション → このファイルの順に、同じトランザクションで実行する。
-- 期待と違えば例外で止まる。最後まで進めば「payee unify migration check: OK」と表示する。

do $$
declare
  g constant uuid := '00000000-0000-4000-8000-0000000000aa';
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  b constant uuid := '00000000-0000-4000-8000-00000000000b';
  v_food bigint := (select id from public.categories where name = '食費');
  v_actual text;
  v_expected text;

  -- 支払い先を非表示にしているメンバー（A・B の順に並べた文字列。誰もいなければ空）
  -- を、名前ごとに「名前=AB」の形で並べる
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payees'
      and column_name in ('owner_user_id', 'is_hidden')
  ) then
    raise exception 'owner_user_id / is_hidden が残っている';
  end if;

  select string_agg(
           p.name || '=' || coalesce((
             select string_agg(case h.user_id when a then 'A' when b then 'B' else '?' end, ''
                               order by h.user_id)
             from public.payee_hidden_members h where h.payee_id = p.id
           ), ''),
           ', ' order by p.name collate "C")
    into v_actual
  from public.payees p where p.group_id = g;
  -- グループ全体→全員に表示／自分用→相方だけ非表示／非表示→全員非表示／統合→表示していた人には表示
  select string_agg(x, ', ' order by x collate "C") into v_expected
  from unnest(array['スーパー=', 'A本屋=B', 'B薬局=A', '閉店=AB', '近所の店=', '片方だけ非表示=A']) x;
  if v_actual is distinct from v_expected then
    raise exception E'非表示の移行が違う\n  actual:   %\n  expected: %', v_actual, v_expected;
  end if;

  -- 同名は管理者の方に統合され、既定値は管理者のもの
  if not exists (
    select 1 from public.payees p
    where p.group_id = g and p.name = '近所の店'
      and p.id = (select payee_id from chk where key = 'dup_a')
      and p.default_category_id = v_food
  ) then
    raise exception '近所の店が管理者の方（既定値＝食費）に統合されていない';
  end if;
  if exists (select 1 from public.payees where id = (select payee_id from chk where key = 'dup_b')) then
    raise exception '統合された側の支払い先が残っている';
  end if;
  if (select payee_id from chk where key = 'half_a')
     is distinct from (select id from public.payees where group_id = g and name = '片方だけ非表示') then
    raise exception '片方だけ非表示が管理者の方に統合されていない';
  end if;

  -- レシート・別名は統合先に付く。レシートの店名・更新日時は変わらない
  if (select count(*) from public.receipts r
      where r.group_id = g
        and r.payee_id = (select payee_id from chk where key = 'dup_a')
        and r.payee_name = '近所の店'
        and r.updated_at = '2026-01-01T00:00:00Z') <> 2 then
    raise exception 'レシートが統合先に付け替わっていない、または内容が変わっている';
  end if;
  select string_agg(name, ',' order by name collate "C") into v_actual
  from public.payee_aliases where payee_id = (select payee_id from chk where key = 'dup_a');
  if v_actual is distinct from '近所A,近所B' then
    raise exception '別名が統合先に付け替わっていない: %', v_actual;
  end if;

  -- 統合された一般メンバーの既定値は、共通（管理者の既定値）と違うため、その人の自分用の既定値として残る
  select string_agg(
           case d.user_id when a then 'A' when b then 'B' else '?' end
             || ':' || coalesce(c.name, '-') || ':'
             || coalesce((select string_agg(t.name, ',' order by t.name collate "C")
                          from public.payee_member_default_tags mt
                          join public.tags t on t.id = mt.tag_id
                          where mt.payee_id = d.payee_id and mt.user_id = d.user_id), ''),
           ', ' order by d.user_id)
    into v_actual
  from public.payee_member_defaults d
  left join public.categories c on c.id = d.default_category_id
  where d.payee_id = (select payee_id from chk where key = 'dup_a');
  if v_actual is distinct from 'B:日用品:移行確認タグ' then
    raise exception '近所の店の自分用の既定値が違う: %', v_actual;
  end if;
  -- 既定値が同じ統合（片方だけ非表示）や、統合していない支払い先には自分用の既定値を作らない
  if (select count(*) from public.payee_member_defaults d
      join public.payees p on p.id = d.payee_id
      where p.group_id = g) <> 1 then
    raise exception '統合で既定値が違う場合以外にも、自分用の既定値が作られている';
  end if;

  raise notice 'payee unify migration check: OK';
end;
$$;
