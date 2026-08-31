-- 「店舗」を「支払い先」という呼称に統一するため、storesテーブルをpayeesへ、
-- receipts.store_id/store_nameをpayee_id/payee_nameへリネームする。
-- PostgresのALTER TABLE/COLUMN RENAMEは制約・インデックス・RLSポリシー・
-- トリガーを保持したまま名前だけを変更するため、それらの再作成は不要。

alter table public.stores rename to payees;

alter index stores_pkey rename to payees_pkey;
alter index stores_group_name_uniq rename to payees_group_name_uniq;

alter table public.payees rename constraint stores_group_id_fkey to payees_group_id_fkey;

alter policy "member can read own group stores" on public.payees
  rename to "member can read own group payees";
alter policy "admin can write own group stores" on public.payees
  rename to "admin can write own group payees";

alter table public.receipts rename column store_id to payee_id;
alter table public.receipts rename column store_name to payee_name;
alter table public.receipts rename constraint receipts_store_id_fkey to receipts_payee_id_fkey;
