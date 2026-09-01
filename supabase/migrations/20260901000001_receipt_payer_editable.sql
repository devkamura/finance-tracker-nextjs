-- 支払者を編集画面から変更可能にする（全ユーザー変更可）。
-- 従来は登録者本人に固定するcheck制約があったが、これを撤廃する。

alter table public.receipts
  drop constraint receipts_payer_is_creator;
