# テスト仕様書

## 追加機能：レシート・精算コア機能

対象：[docs/basic-design.md](./basic-design.md)。テストフレームワーク: Vitest（単体・結合）。
Gemini APIを呼び出す既存OCR機能（`extractReceiptOcr`）は変更していないため対象外。Google Drive連携（`uploadJsonToDrive`）は本機能で廃止したため関連テストは削除した。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-23 | `lib/settlement/calculate.ts` | 正常系：共同支出は1/2ずつ負担 | 共同10,000円、Aが全額支払い | A負担5,000円/B負担5,000円、精算差額よりBがAへ5,000円支払う | なし（純粋関数） |
| U-24 | `lib/settlement/calculate.ts` | 正常系：明細合計と支払額が不一致の場合の按分 | 明細合計2,000円（共同1,000/B個人1,000）、支払額1,500円 | A負担375円、B負担1,125円（要件書の例と一致） | なし |
| U-25 | `lib/settlement/calculate.ts` | 正常系：端数を最大剰余法で配分 | 支払額1,000円を同額の明細3件で按分 | 端数1円が明細に加算され、合計が支払額と一致する | なし |
| U-26 | `lib/settlement/calculate.ts` | 正常系：税別明細は税込換算してから按分 | 税別1,000円×1.08 | 税込換算後1,080円を基準に按分される | なし |
| U-27 | `lib/settlement/calculate.ts` | 正常系：個人立替額の算出 | 支払者A・帰属先Bの明細5,000円 | 立替額として`{from:A, to:B, amount:5000}`が算出される | なし |
| U-28 | `lib/settlement/calculate.ts` | 正常系：返金は金額をマイナスとして集計 | 支出3,000円＋返金1,000円 | 実支払額・負担額とも2,000円になる | なし |
| U-29 | `lib/settlement/calculate.ts` | 異常系：明細金額の合計が0円 | 明細price=0 | 按分せず0として扱い、支払額はpayerへ全額計上 | なし |
| U-30 | `lib/validation/receipt-rules.ts` | 正常系/異常系：税区分に応じた税率必須チェック | `taxType:"exclusive"`かつ`taxRateId:""` / `taxType:"inclusive"` | 税別の場合のみ「税率が必須です。」を返す | なし |
| U-31 | `lib/validation/receipt-rules.ts` | 異常系：帰属先が実在しないユーザー | `ownerUserId`がグループメンバー外 | 「帰属先が不正です。」 | なし |
| U-32 | `lib/actions/create-receipt.ts` | 異常系：確定済み月への登録 | `is_settlement_confirmed`がtrueを返す | 「確定済みのため登録できません」を含むエラー | `createClient`（rpc応答をスタブ） |
| U-33 | `lib/actions/create-receipt.ts` | 正常系：画像ありでの登録 | 有効な画像ファイル | `uploadReceiptImage`が呼ばれ、`{success:true}` | `createClient`, `uploadReceiptImage` |
| U-34 | `lib/actions/create-receipt.ts` | 異常系：明細INSERT失敗時のロールバック | `receipt_details`のINSERTがエラー | レシート本体行が削除される | `createClient` |
| U-35 | `lib/actions/update-receipt.ts` | 異常系：対象レシートが自グループ外 | 他グループのレシートID | 「レシートが見つかりません。」 | `createClient` |
| U-36 | `lib/actions/update-receipt.ts` | 異常系：更新前後どちらかの月が確定済み | 旧または新`occurred_at`の月が確定済み | 「確定済みのため変更できません」 | `createClient` |
| U-37 | `lib/actions/delete-receipt.ts` | 正常系：画像付きレシートの削除 | `receipt_image_path`あり | `deleteReceiptImage`が呼ばれ、`{success:true}` | `createClient`, `deleteReceiptImage` |
| U-38 | `lib/actions/confirm-settlement.ts` | 異常系：既に確定済み | `getSettlementSummary().isConfirmed === true` | 「既に確定済みです。」 | `createClient`, `getSettlementSummary` |
| U-39 | `lib/actions/confirm-settlement.ts` | 正常系：確定RPC呼び出し | 未確定の精算サマリー | `confirm_settlement`RPCが計算値付きで呼ばれる | `createClient`, `getSettlementSummary` |
| U-40 | `lib/actions/reopen-settlement.ts` | 異常系：管理者以外 | `role:"member"` | 「管理者のみ再オープンできます。」 | `createClient` |
| U-41 | `lib/actions/reopen-settlement.ts` | 正常系：管理者による再オープン | `role:"admin"` | `reopen_settlement`RPCが呼ばれ`{success:true}` | `createClient` |
| U-42 | `lib/actions/update-receipt.ts` | 異常系：支払者がグループメンバー外 | `payerUserId`がグループメンバー以外 | 「支払者が不正です。」 | `createClient` |
| U-43 | `lib/actions/update-receipt.ts` | 正常系：支払者を他メンバーに変更できる（全メンバー可） | `payerUserId`が既存の支払者と異なる | `{success:true}` | `createClient` |

### 結合テスト

ローカルSupabaseスタック（`supabase start`）に対する実接続で実施。`supabase/tests/integration/receipts-settlement.integration.test.ts`。

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| I-18 | マスタデータ | カテゴリ・目的・税率が要件定義書どおりに整理されている | シード後の`categories`/`purposes`/`consumption_taxes` | 「交際費」がカテゴリ側のみに存在、「友人」が目的に存在、税率が8%/10%のみ | なし（実DB） |
| I-19 | `profiles` RLS | 一般メンバーによる相方の表示名参照 | 一般メンバーのセッションで管理者のprofilesをSELECT | 参照できる（従来は管理者のみ参照可だった制限を緩和） | なし（実DB） |
| I-20 | `receipts`/`receipt_details` RLS | メンバーによるレシート・明細の登録 | 一般メンバーが共同・個人混在の明細を登録 | 成功する | なし（実DB） |
| I-21 | `receipts` RLS | 支払者は登録者以外にも自由に変更できる（全メンバー可） | 一般メンバーが`payer_user_id`をUPDATE | 成功する（`receipts_payer_is_creator`制約は撤廃済み） | なし（実DB） |
| I-22 | `receipts` RLS | 他グループからの参照拒否 | 別グループのセッションでSELECT | 0件 | なし（実DB） |
| I-23 | `confirm_settlement` / `is_settlement_confirmed` RPC | 精算確定後は当該月への書き込みが拒否される | 確定後に同月へレシートをINSERT | `42501`（RLS違反）で失敗する | なし（実DB） |
| I-24 | `reopen_settlement` RPC | 管理者以外は再オープン不可、管理者は可能 | 一般メンバー→エラー、管理者→成功 | 管理者のみ成功し、以後同月への書き込みが再び可能になる | なし（実DB） |
| I-25 | `receipt_details` check制約 | 税別明細は税率必須 | `tax_type:'exclusive'`かつ`tax_rate_id:null` | 制約違反で失敗、税率ありなら成功 | なし（実DB） |

### E2Eテスト

**今回のスコープでは未実装。**（他機能と同様、Playwright未導入のためVitestの単体・結合テストまでとする。）

---

## 追加機能：管理画面（グループ・管理者・ユーザー管理・支払い先管理）

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
| U-12b | `lib/actions/invite-group-member.ts` | 異常系：人数上限（管理者含め2人） | 既に2人登録済み | 「グループの登録人数上限（管理者含め2人）に達しています。」 | `createClient` |
| U-12c | `lib/actions/invite-group-member.ts` | 異常系：DBトリガーによる上限拒否（同時招待等の競合） | INSERTが`group member limit`メッセージのエラーを返す | 同上のフレンドリーメッセージに変換される | `createClient` |
| U-13 | `lib/actions/update-member-display-name.ts` | 異常系：未ログイン | `user = null` | `{success:false}` | `createClient` |
| U-14 | `lib/actions/update-member-display-name.ts` | 異常系：表示名が空 | `""` | 「表示名を入力してください。」 | `createClient` |
| U-15 | `lib/actions/update-member-display-name.ts` | 異常系：対象が自グループ外（更新0件） | update結果が0件 | 「権限がありません。」 | `createClient` |
| U-16 | `lib/actions/update-member-display-name.ts` | 正常系 | 自グループ内の有効なuserId・表示名 | `{success:true, displayName}` | `createClient` |
| U-17 | `lib/actions/create-payee.ts` | 異常系：支払い先名重複（23505） | 既存支払い先と同名 | 「同じ名前の支払い先が既に存在します。」 | `createClient` |
| U-18 | `lib/actions/create-payee.ts` | 正常系 | 未使用の支払い先名 | `{success:true, payee}` | `createClient` |
| U-19 | `lib/actions/update-payee.ts` / `delete-payee.ts` | 正常系 | 自グループの支払い先ID | `{success:true}` | `createClient` |
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
| I-04 | `payees` RLS | グループ間のSELECT分離 | グループBのセッションでグループAの支払い先を取得 | 0件（他グループの行が返らない） | なし（実DB） |
| I-05 | `payees` RLS | 非管理者のINSERT拒否 | 一般メンバーが支払い先をINSERT | 権限エラーで失敗 | なし（実DB） |
| I-06 | `payees` RLS | 管理者は自グループのみ書き込み可 | グループAの管理者がグループBの`group_id`を指定してINSERT | 失敗（他グループへの書き込み不可） | なし（実DB） |
| I-07 | `group_members` 招待INSERT | 重複招待の拒否 | 空きのあるグループに同一メールを2回招待 | 2回目が失敗する（1グループ2人上限のもとでは、一意制約ではなく人数上限チェックが先に働くため、エラー要因までは固定しない） | なし（実DB） |
| I-18 | `group_members` 人数上限トリガー | 管理者含め3人目は登録不可 | 既に2人（管理者+一般）のグループへ3人目を招待 | 例外（`group member limit`）で拒否される | なし（実DB） |
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
| E-05 | 支払い先管理のグループ分離 | 1. グループAの管理者が支払い先を登録 2. グループBの管理者としてログインし`/admin/payees`を確認 | グループAの支払い先が表示されない | Google OAuth |
| E-06 | ユーザー名管理 | 1. 管理者が`/admin/users`でメンバーの表示名を編集 | 保存され、対象ユーザーの`/`ヘッダー表示名が更新される | Google OAuth |
