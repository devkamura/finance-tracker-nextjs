-- 消費税マスタを「税率」のみを表すデータに整理する。
-- 要件定義書20章により、明細は「税込／税別」をtax_type列として別軸で管理し
-- （receipt_details.tax_type、20260831000003_receipts.sql参照）、
-- 税別の場合のみこのマスタから税率を選択する設計に変更した。
-- 「税込」「税なし」は税額計算上どちらも乗率1.00で同じ扱いのため、
-- tax_type='inclusive'側に統合し、このマスタからは不要になる。

update public.consumption_taxes set name = '8%' where name = '税別(8%)';
update public.consumption_taxes set name = '10%' where name = '税別(10%)';
delete from public.consumption_taxes where name in ('税込', '税なし');
