-- 管理画面でユーザーごとに色を設定できるようにする。支払者・帰属先など
-- ユーザー名を表示する箇所で、設定した色のバッジ表示に使う。
-- 表示名編集と同様、更新は管理者のみ（admin_manages_user、既存の
-- "admin can update managed profiles" ポリシーがcolor列にもそのまま適用される）。

alter table public.profiles add column color text
  check (
    color is null or color in (
      'red', 'orange', 'amber', 'yellow', 'lime', 'green',
      'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'
    )
  );
