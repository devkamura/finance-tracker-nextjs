# テスト仕様書

## 追加機能：管理画面（グループ・管理者・ユーザー管理・店舗管理）

テストフレームワーク: Vitest（単体・結合）/ Playwright（E2E）。
外部API（Gemini, Google Drive）を呼び出す既存機能には影響しないため、本機能のテストで新規に外部APIモックが必要な箇所はない。

## 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-01 | `lib/validation/email-rules.ts` | 正常系：有効なメールアドレス | `"user@example.com"` | エラー配列が空 | なし |
| U-02 | `lib/validation/email-rules.ts` | 異常系：空文字 | `""` | 「メールアドレスを入力してください。」を含む配列 | なし |
| U-03 | `lib/validation/email-rules.ts` | 異常系：形式不正 | `"not-an-email"` | 「メールアドレスの形式が正しくありません。」を含む配列 | なし |
| U-04 | `lib/validation/email-rules.ts` | 正常系：前後空白・大文字を正規化して検証 | `"  User@Example.com  "` | エラーなし、正規化後の値が返る | なし |
| U-05 | `lib/actions/create-group.ts` | 異常系：未ログイン | `user = null` | `{success:false}` かつ「ログインが必要です。」 | `createClient` |
| U-06 | `lib/actions/create-group.ts` | 異常系：グループ名が空 | `name = " "` | `{success:false}` バリデーションエラー | `createClient` |
| U-07 | `lib/actions/create-group.ts` | 正常系：RPC成功 | 有効な名前 | `{success:true, groupId}` | `createClient`（rpc応答をスタブ） |
| U-08 | `lib/actions/create-group.ts` | 異常系：既に所属済み（RPCエラー） | RPCが「already belongs」例外を返す | 「既にグループに所属しています。」 | `createClient` |
| U-09 | `lib/actions/invite-group-member.ts` | 異常系：未ログイン | `user = null` | `{success:false}` | `createClient` |
| U-10 | `lib/actions/invite-group-member.ts` | 異常系：メール形式不正 | `"invalid"` | バリデーションエラーを返す | `createClient` |
| U-11 | `lib/actions/invite-group-member.ts` | 異常系：重複登録（Postgresエラー23505） | 同一メール・同一グループ | 「既に追加済みのメールアドレスです。」 | `createClient` |
| U-12 | `lib/actions/invite-group-member.ts` | 正常系 | 未登録の有効なメール | `{success:true}` | `createClient` |
| U-13 | `lib/actions/update-member-display-name.ts` | 異常系：未ログイン | `user = null` | `{success:false}` | `createClient` |
| U-14 | `lib/actions/update-member-display-name.ts` | 異常系：表示名が空 | `""` | 「表示名を入力してください。」 | `createClient` |
| U-15 | `lib/actions/update-member-display-name.ts` | 異常系：対象が自グループ外（更新0件） | update結果が0件 | 「権限がありません。」 | `createClient` |
| U-16 | `lib/actions/update-member-display-name.ts` | 正常系 | 自グループ内の有効なuserId・表示名 | `{success:true, displayName}` | `createClient` |
| U-17 | `lib/actions/create-store.ts` | 異常系：店舗名重複（23505） | 既存店舗と同名 | 「同じ名前の店舗が既に存在します。」 | `createClient` |
| U-18 | `lib/actions/create-store.ts` | 正常系 | 未使用の店舗名 | `{success:true, store}` | `createClient` |
| U-19 | `lib/actions/update-store.ts` / `delete-store.ts` | 正常系 | 自グループの店舗ID | `{success:true}` | `createClient` |
| U-20 | `lib/actions/remove-group-member.ts` | 異常系：未ログイン | `user = null` | `{success:false}` かつ「ログインが必要です。」 | `createClient` |
| U-21 | `lib/actions/remove-group-member.ts` | 異常系：RLS拒否（削除0件、他グループ or 管理者自身） | delete結果が0件 | 「権限がありません。」 | `createClient` |
| U-22 | `lib/actions/remove-group-member.ts` | 正常系 | 削除可能なmemberId | `{success:true}` | `createClient` |

## 結合テスト

ローカルSupabaseスタック（`supabase start`）に対する実接続で実施。service_roleクライアントで2グループ・複数ユーザーを事前に用意する。

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| I-01 | `create_group_with_admin` RPC | 未所属ユーザーがグループ作成 | 新規ユーザーA | グループが作成され、Aが`role='admin'`で`group_members`に登録される | なし（実DB） |
| I-02 | `create_group_with_admin` RPC | 既所属ユーザーは再作成不可 | 既にグループに所属するユーザー | 例外が発生し新規グループが作られない | なし（実DB） |
| I-03 | `create_group_with_admin` RPC | 同時二重作成の競合防止 | 同一ユーザーで並行して2回呼び出し | 一方のみ成功し、`group_members`の管理者行が2件にならない | なし（実DB） |
| I-04 | `stores` RLS | グループ間のSELECT分離 | グループBのセッションでグループAの店舗を取得 | 0件（他グループの行が返らない） | なし（実DB） |
| I-05 | `stores` RLS | 非管理者のINSERT拒否 | 一般メンバーが店舗をINSERT | 権限エラーで失敗 | なし（実DB） |
| I-06 | `stores` RLS | 管理者は自グループのみ書き込み可 | グループAの管理者がグループBの`group_id`を指定してINSERT | 失敗（他グループへの書き込み不可） | なし（実DB） |
| I-07 | `group_members` 招待INSERT | 重複招待の拒否 | 同一グループに同一メールを2回招待 | 2回目が一意制約違反で失敗 | なし（実DB） |
| I-08 | `_link_group_membership` / `link_pending_group_memberships` | 事前登録ユーザーの初回ログイン時紐付け | 招待済みメールと同じユーザーが新規サインアップ | `group_members.user_id`が自動的にセットされる | なし（実DB） |
| I-09 | `_link_group_membership` | 既存ユーザーへの後日招待 | 既にサインアップ済みのユーザーを後から招待し`link_pending_group_memberships`を実行 | `user_id`が正しく紐付く | なし（実DB） |
| I-10 | `profiles` RLS | 管理者による他ユーザーの表示名更新 | 自グループメンバーのprofilesをUPDATE | 成功する | なし（実DB） |
| I-11 | `profiles` RLS | 管理者による他グループユーザーの表示名更新拒否 | 他グループのuser_idを指定してUPDATE | 0件更新（拒否される） | なし（実DB） |
| I-12 | `profiles` RLS | 一般ユーザーの自己編集拒否 | 一般ユーザーが自分のprofilesをUPDATE | 拒否される（既存の自己編集ポリシー削除の確認） | なし（実DB） |
| I-13 | `group_members` DELETE RLS | 招待中(未参加)メンバーの削除 | 管理者が自グループの招待中メンバーをDELETE | 削除される | なし（実DB） |
| I-14 | `group_members` DELETE RLS | 管理者自身は削除不可 | 管理者が自分自身(role='admin')の行をDELETE | 0件削除（拒否される） | なし（実DB） |
| I-15 | `group_members` DELETE RLS | 一般ユーザーは削除不可 | 一般メンバーが他のメンバーをDELETE | 0件削除（拒否される） | なし（実DB） |
| I-16 | `group_members` DELETE RLS | 他グループの管理者は削除不可 | グループBの管理者がグループAのメンバーをDELETE | 0件削除（拒否される） | なし（実DB） |
| I-17 | `group_members` DELETE RLS | 参加済み一般メンバーの削除 | 管理者が自グループの参加済み一般メンバーをDELETE | 削除される | なし（実DB） |

## E2Eテスト

**今回のスコープでは未実装。**（ユーザー確認済み）
このMac環境（macOS 13）では最新のPlaywrightがChromiumブラウザをインストールできず、ローカルで動作確認するには既知の脆弱性を含む古いバージョンへの固定が必要になるため、今回はVitestによる単体・結合テストまでの実装とし、E2E自動化は見送った。以下は将来Playwright等を導入する際の項目として残す。

| No | シナリオ | 操作手順 | 期待結果 | モック対象 |
|---|---|---|---|---|

| No | シナリオ | 操作手順 | 期待結果 | モック対象 |
|---|---|---|---|---|
| E-01 | 未所属ユーザーの初回セットアップ | 1. 未所属ユーザーとしてログイン状態にする 2. `/`にアクセス | `/setup/group`へリダイレクトされる | Google OAuth（セッション直接発行） |
| E-02 | グループ作成と管理者昇格 | 1. `/setup/group`でグループ名を入力し作成 | `/`へ遷移し、ヘッダーに「管理画面」リンクが表示される | Google OAuth |
| E-03 | 招待〜自動参加フロー | 1. 管理者がグループAで対象メールを招待 2. 対象メールで新規ログイン | 対象ユーザーがグループAのメンバーとして`/`にアクセスできる（`/setup/group`に飛ばされない） | Google OAuth |
| E-04 | 非管理者の管理画面アクセス拒否 | 1. 一般メンバーとしてログイン 2. `/admin`に直接アクセス | `/`へリダイレクトされる | Google OAuth |
| E-05 | 店舗管理のグループ分離 | 1. グループAの管理者が店舗を登録 2. グループBの管理者としてログインし`/admin/stores`を確認 | グループAの店舗が表示されない | Google OAuth |
| E-06 | ユーザー名管理 | 1. 管理者が`/admin/users`でメンバーの表示名を編集 | 保存され、対象ユーザーの`/`ヘッダー表示名が更新される | Google OAuth |
