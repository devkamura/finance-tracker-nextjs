-- 設定画面で、登録済みのレシートで使われている支払い先・内訳・相手・タグを見分けるための関数
-- （使われているものはDBの外部キーで削除できないため、設定画面でゴミ箱を非活性にする。2026-10-04 画面確認で追加）。
-- 件数が多くても取りこぼさないよう（API の max_rows に左右されないよう）、DBで重複を除いたIDの一覧にして返す。
-- security invoker のため、RLS により呼び出したユーザーのグループのレシートだけが対象になる。
-- 戻り値：{ payees: [...], breakdowns: [...], counterparts: [...], tags: [...] }

create or replace function public.used_setting_ids(p_group_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'payees', coalesce((
      select jsonb_agg(distinct r.payee_id)
      from public.receipts r
      where r.group_id = p_group_id and r.payee_id is not null
    ), '[]'::jsonb),
    'breakdowns', coalesce((
      select jsonb_agg(distinct d.breakdown_id)
      from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where r.group_id = p_group_id and d.breakdown_id is not null
    ), '[]'::jsonb),
    'counterparts', coalesce((
      select jsonb_agg(distinct d.counterpart_id)
      from public.receipt_details d
      join public.receipts r on r.id = d.receipt_id
      where r.group_id = p_group_id
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(distinct dt.tag_id)
      from public.receipt_detail_tags dt
      join public.receipt_details d on d.id = dt.receipt_detail_id
      join public.receipts r on r.id = d.receipt_id
      where r.group_id = p_group_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.used_setting_ids(uuid) from public;
grant execute on function public.used_setting_ids(uuid) to authenticated;
