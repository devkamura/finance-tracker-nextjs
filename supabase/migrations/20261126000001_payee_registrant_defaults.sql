-- 支払い先の共通の既定値で、相手・帰属先に「登録する人」を選べるようにする（Issue #44、
-- docs/requirements.md「追加機能：支払い先の既定値「登録する人」」）。
-- 「登録する人」は、レシートの入力で既定値を入れるときに、操作しているメンバー本人に置き換える
-- （置き換えは画面の中で行うため、DB には「登録する人」かどうかのフラグだけを持つ）。
-- 自分用の既定値（payee_member_defaults）では選べないため、列は payees にだけ足す。
-- 既存の支払い先はすべて false（これまでの既定値のまま）。

alter table public.payees
  add column default_counterpart_registrant boolean not null default false,
  add column default_owner_registrant boolean not null default false,
  -- 相手＝登録する人のときは、相手の id を持たない
  add constraint payees_default_counterpart_registrant_check
    check (not (default_counterpart_registrant and default_counterpart_id is not null)),
  -- 帰属先＝登録する人のときは、共同・メンバーを持たない
  add constraint payees_default_owner_registrant_check
    check (
      not (
        default_owner_registrant
        and (default_owner_joint or default_owner_user_id is not null)
      )
    );

comment on column public.payees.default_counterpart_registrant is
  '相手の既定値＝登録する人（入力するメンバー本人の相手に置き換える）';
comment on column public.payees.default_owner_registrant is
  '帰属先の既定値＝登録する人（入力するメンバー本人に置き換える）';
