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

## 追加機能：税率自動推定・OCR明細確認UI

対象：`docs/家計簿アプリ 要件定義書.md` 20章（追記）。テストフレームワーク: Vitest（単体）。
Gemini APIを呼び出す箇所（`extractReceiptFromImage`）は必ずモックする。

金額整合性チェック（明細合計と支払額の一致確認モーダル）は廃止した。店舗によって
値引きが小計計算前に適用される等、計算順序が店ごとに異なり明細から支払額を正確に
再現できないため、確認はユーザーの目視に委ねる方針とした
（`lib/receipts/amount-check.ts`および関連テストは削除）。
代わりに、各明細のアコーディオンを開かなくても価格・税区分・税率を確認できるよう
折りたたみ時のヘッダーにサマリー表示を追加した。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-48 | `components/receipt-form/ReceiptForm.ts`（`buildOcrItem`） | 正常系：OCR取り込み時の税区分デフォルトは税別、価格は再計算しない | OCR結果 `price:1000, taxRatePercent:8` | `taxType:"exclusive"`、`price:"1000"`（税込換算しない）、`taxRateId`は8%のマスタIDが選択済み | なし（純粋関数） |
| U-49 | `components/receipt-form/ReceiptForm.ts`（`buildOcrItem`） | 異常系：税率が推定できない場合は税率未選択のまま返す | OCR結果 `taxRatePercent:null` | `taxType:"exclusive"`、`taxRateId:""`（送信時バリデーションで税率必須エラーとなる） | なし |

### 結合テスト

今回はDB・RLSに変更がないため対象なし。

### E2Eテスト

**今回のスコープでは未実装。**（他機能と同様、Playwright未導入のためVitestの単体テストまでとする。）
折りたたみ時のサマリー表示（価格・税区分・税率）は、コンポーネントテスト基盤
（Testing Library等）が未導入のため自動テスト対象外とし、実装後にブラウザでの
目視確認で担保する。

---

## 追加機能：登録後の一覧画面遷移

対象：レシート登録画面（`components/receipt-form/ReceiptForm.tsx`）。テストフレームワーク: Vitest（単体）。

レシート登録後に、正常に登録できたことを確認できるよう、登録したレシートの
支払い月（`datetime`の年月。未入力時は登録時刻の年月）の一覧画面
（`/receipts?month=YYYY-MM&open=<receiptId>`）へ遷移できるようにした。
`open`パラメータは一覧画面（`app/(app)/receipts/page.tsx`）に既存の仕組みで、
該当レシートのアコーディオンを自動的に開いた上でその位置まで自動スクロールする
（`components/receipt-list/ReceiptAccordionItem.tsx`の`initiallyOpen`）。

連続してレシートを登録したいケースを考慮し、登録画面に「登録後、支払い月の
一覧画面に移動して確認する」チェックボックスを追加し、オフにすると従来通り
フォームをリセットして登録画面に留まる。この設定は連続登録中にリセットされない
（初期値はON）。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-50 | `components/receipt-form/ReceiptForm.ts`（`resolveOccurredMonth`） | 正常系：datetime入力ありの場合はその年月を返す | `"2026-09-05T12:00"` | `"2026-09"` | なし（純粋関数、`vi.useFakeTimers`で現在時刻固定） |
| U-51 | `components/receipt-form/ReceiptForm.ts`（`resolveOccurredMonth`） | 異常系：datetime未入力の場合は現在時刻の年月を返す | `""`（現在時刻を2026-10-15に固定） | `"2026-10"` | なし |

### 結合テスト

今回はDB・RLSに変更がないため対象なし。

### E2Eテスト

**今回のスコープでは未実装。**（Playwright未導入のためVitestの単体テストまでとする。）
チェックボックスON/OFFによる遷移有無の切り替え、一覧画面での自動オープン・
自動スクロールは、コンポーネント/E2Eテスト基盤が未導入のため自動テスト対象外とし、
実装後にブラウザでの目視確認で担保する。

---

## 追加機能：相方分レシートの同時登録（複製登録）

対象：`docs/requirements.md`「追加機能：相方分レシートの同時登録（複製登録）」。テストフレームワーク: Vitest（単体・結合）。
外部API（Gemini）への通信は発生しない。Supabaseクライアント・Storageは単体テストではモックする。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-52 | `lib/receipts/duplicate.ts`（`buildPartnerItems`） | 正常系：帰属先の私→相方置き換え | 帰属先が私／相方／共同の明細3件 | 私→相方、相方は相方のまま、共同は共同のまま。商品名・価格・税区分・税率・カテゴリー・目的・シーンは元と同じ | なし（純粋関数） |
| U-53 | `lib/receipts/duplicate.ts`（`findPartner`） | 正常系/異常系：相方の特定 | メンバー2人／自分のみ | 2人なら自分以外のメンバー、1人ならnull | なし（純粋関数） |
| U-54 | `lib/actions/create-receipt.ts` | 正常系：チェックOFFでは従来どおり1件のみ登録 | `duplicateForPartner`未指定 | `receipts`へのINSERTは1回、`is_duplicated:false`・支払者＝登録者 | `createClient` |
| U-55 | `lib/actions/create-receipt.ts` | 正常系：チェックONで相方分を複製登録 | `duplicateForPartner:"true"`、メンバー2人 | `receipts`へのINSERTが2回。2件目は支払者＝相方・登録者＝本人・`is_duplicated:true`、明細の帰属先の「私」が「相方」に置き換わっている（相方・共同はそのまま）。戻り値の`receiptId`は自分のレシート | `createClient` |
| U-56 | `lib/actions/create-receipt.ts` | 正常系：画像付きで複製登録すると別ファイルとしてコピーされる | `duplicateForPartner:"true"`＋画像 | `uploadReceiptImage`が異なるreceiptIdで2回呼ばれる | `createClient`, `uploadReceiptImage` |
| U-57 | `lib/actions/create-receipt.ts` | 異常系：複製側の登録失敗時は元レシートも取り消す | 2件目の`receipts`INSERTがエラー | 元レシート行が削除され、画像も削除され、「相方分のレシートの登録に失敗しました。」を返す | `createClient`, `uploadReceiptImage`, `deleteReceiptImage` |
| U-58 | `lib/actions/create-receipt.ts` | 異常系：相方がいないのに複製指定 | `duplicateForPartner:"true"`、メンバー1人 | 何も登録せず「相方がグループにいないため、複製登録できません。」を返す | `createClient` |
| U-59 | `lib/receipts/queries.ts`（`listReceipts`） | 正常系：複製フラグと登録者名のマッピング | `is_duplicated:true`、`created_by`＝ユーザーA | `isDuplicated:true`、`createdByDisplayName`＝Aの表示名 | `createClient`相当のスタブ, `getGroupMembers` |

### 結合テスト

ローカルSupabaseスタック（`supabase start`）に対する実接続で実施。`supabase/tests/integration/receipts-settlement.integration.test.ts`。

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| I-26 | `receipts.is_duplicated` 列 | 既定値はfalse | `is_duplicated`を指定せずINSERT | `is_duplicated = false` で保存される | なし（実DB） |
| I-27 | `receipts` RLS | 相方を支払者とした複製レシートの登録 | 一般メンバーが`payer_user_id`＝相方、`created_by`＝本人、`is_duplicated:true`でINSERT | 成功し、相方のセッションからも`is_duplicated = true`として参照できる | なし（実DB） |

### E2Eテスト

**今回のスコープでは未実装。**（他機能と同様、Playwright未導入のためVitestの単体・結合テストまでとする。）
以下は実装後にブラウザでの目視確認で担保する。

| No | シナリオ | 操作手順 | 期待結果 | モック対象 |
|---|---|---|---|---|
| E-07 | 相方分の複製登録 | 1. 登録画面で内容を入力 2. 「相方の分も同じ内容で登録する」にチェック 3. 確認モーダルで送信 | モーダルに「2件登録します」と表示され、一覧に自分と相方のレシートが並び、相方のレシートにだけオレンジの「複製」アイコンが表示される | Gemini API（OCR利用時） |
| E-08 | 詳細画面での複製アイコン | 1. 一覧から複製レシートの詳細を開く | 「複製」アイコンと「◯◯さんが複製登録したレシートです」の説明が表示される | なし |
| E-09 | 相方不在時の非表示 | 1. メンバー1人のグループで登録画面を開く | 複製チェックボックスが表示されない | なし |
| E-10 | 帰属先の変更ルールの表示 | 1. 登録画面で複製チェックボックス横の「i」アイコンをタップ | 「私 → 相方」「相方 → 相方（変化なし）」「共同 → 共同（変化なし）」が相方の表示名付きでツールチップ表示され、アイコンのタップではチェック状態が変わらない | なし |

---

## 追加機能：支出分析（フェーズ0＋1：土台・分析画面の円グラフ・メンバーの色）

対象：[docs/支出分析機能/基本設計書.md](./支出分析機能/基本設計書.md)、[docs/支出分析機能/詳細設計書.md](./支出分析機能/詳細設計書.md)。テストフレームワーク: Vitest（単体・結合）。
外部API・有料サービスへの通信は発生しない。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-60 | `lib/analytics/months.ts` | 正常系：月の境界 | 9/30 23:59、10/1 0:00 | それぞれ`2026-09`・`2026-10`。既存の`monthPeriod`の範囲と一致する | なし |
| U-61 | `lib/analytics/months.ts` | 正常系：12ヶ月の列挙 | 今日`2026-10-03`／`2026-03-31` | `2025-11`〜`2026-10`／`2025-04`〜`2026-03`（年をまたぐ） | なし |
| U-62 | `lib/analytics/months.ts` | 正常系：取得範囲 | 12ヶ月`2025-11`〜`2026-10` | [2025-11-01 0:00, 2026-11-01 0:00) | なし |
| U-63 | `lib/analytics/queries.ts`（`buildAnalyticsRows`） | 正常系：按分 | 明細1,000円×2、支払額1,500円／税別1,000円(8%)＋税込1,000円、支払額2,080円 | 各750円／1,080円・1,000円 | なし |
| U-64 | `lib/analytics/queries.ts` | 正常系：返金 | 返金レシート8,000円 | -8,000円で計上される | なし |
| U-65 | `lib/analytics/queries.ts` | 正常系：集約 | 同じ月×カテゴリ×帰属先の明細2件＋帰属先違い＋月違い | 同じキーは1行に合計、異なるキーは別の行 | なし |
| U-66 | `lib/analytics/queries.ts`（`getAnalyticsData`） | 正常系：ページング | 1ページ目1,000件、2ページ目1件 | `range(0,999)`→`range(1000,1999)`の2回で止まり、1,001件分が集計される | Supabaseクライアント、`getGroupMembers` |
| U-67 | `lib/analytics/queries.ts`（`getAnalyticsData`） | 正常系：取得期間と返却データ | 現在日時2026-10-03 | 取得条件が[2025-11-01, 2026-11-01)、today・months・categories・membersが返る | Supabaseクライアント、`getGroupMembers` |
| U-68 | `lib/analytics/aggregate.ts`（`sumByCategory`） | 正常系：表示対象 | 共同10,000・A3,000・B2,000（食費） | 全体15,000円、B（共同オフ）2,000円 | なし |
| U-69 | `lib/analytics/aggregate.ts`（`sumByCategory`） | 正常系：共同トグル | 上記＋共同1,001円 | A（共同オン）8,000円・B7,000円でA＋B＝全体。1,001円の1/2は500.5円のまま | なし |
| U-70 | `lib/analytics/aggregate.ts`（`buildPieData`） | 正常系：％の分母 | 食費28,000・日用品10,000・衣類-8,000 | 扇は食費73.7%・日用品26.3%、分母38,000円 | なし |
| U-71 | `lib/analytics/aggregate.ts`（`buildPieData`） | 正常系：マイナスのカテゴリ | 同上／マイナスなし | 衣類が注意書き用に分かれ、合計30,000円／注意書き用は空 | なし |
| U-72 | `lib/analytics/aggregate.ts` | 境界値：明細のない月 | 行のない月 | 扇・合計とも空（0） | なし |
| U-73 | `lib/settlement/calculate.ts` | 回帰：按分処理のexport | 既存のU-23〜U-29 | 変わらず通る | なし |
| U-74 | `lib/analytics/category-colors.ts` | 正常系：カテゴリの色 | 13カテゴリ／色設定あり | ID順に割り当て、13番目は1番目と同じ色／設定色を優先。パレットにブルー・レッド系を含まない | なし |
| U-75 | `lib/actions/update-member-color.ts` | 正常系／異常系：メンバーの色 | `red`／`green`・`purple`・`pink` | 保存できる／「不正な色が指定されました。」 | `createClient` |

### 結合テスト

ローカルSupabaseスタック（`supabase start`）に対する実接続で実施。`supabase/tests/integration/analytics.integration.test.ts`。

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| I-28 | `getAnalyticsData` | 取得上限を超える件数 | 2026年9月・食費・100円のレシート1,001件 | 100,100円としてすべて集計される | なし（実DB） |
| I-29 | `getAnalyticsData` | グループ間の分離（RLS） | 他グループに5,000円のレシート／他グループIDを指定して取得 | 自グループの集計に混ざらない／1件も取得できない | なし（実DB） |
| I-30 | `getAnalyticsData` | 期間の境界 | 2025-10-31 23:59、2025-11-01 0:00、2026-10-31 23:59、2026-11-01 0:00 | 2025-11と2026-10の分だけが含まれる | なし（実DB） |
| I-31 | `profiles.color`の制約 | メンバーの色 | `blue`・`red`・null／`green`・`purple` | 保存できる／DBで拒否される | なし（実DB） |

### E2Eテスト

**実施しない。**（ユーザー確認済み。既存機能と同じく、この環境ではPlaywrightのブラウザを導入できないため）
画面操作の観点は [docs/支出分析機能/手動テスト仕様書.md](./支出分析機能/手動テスト仕様書.md) で手動確認する。

---

## 追加機能：支出分析（フェーズ2：分析画面の推移グラフ）

対象：[docs/支出分析機能/詳細設計書.md](./支出分析機能/詳細設計書.md)（フェーズ2）。テストフレームワーク: Vitest（単体）。
外部API・有料サービスへの通信は発生しない。データ取得は変更しないため結合テストの追加はない。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-76 | `lib/analytics/aggregate.ts`（`sumByMonth`） | 正常系：総支出 | 7月1,300円・8月データなし・9月2,501円 | 古い順に1,300・0・2,501円。対象外の月は含まない | なし |
| U-77 | `lib/analytics/aggregate.ts`（`sumByMonth`） | 正常系：カテゴリ指定 | 日用品を指定 | 日用品だけが合計される | なし |
| U-78 | `lib/analytics/aggregate.ts`（`sumByMonth`） | 正常系：表示対象 | B（共同オフ／オン） | 帰属先Bのみ／共同の1/2を加算（2,250.5円） | なし |
| U-79 | `lib/analytics/aggregate.ts`（`buildTrendData`） | 正常系：前月比 | 30,000→5,001→6,000→6,000 | ―・16.7・120・100（%） | なし |
| U-80 | `lib/analytics/aggregate.ts`（`buildTrendData`） | 境界値：前月比を出さない月 | 1,000→0→500→−3,000→30,000 | ―・0・―・―・―（最初の月、前月0円、当月マイナス、前月マイナス） | なし |
| U-81 | `lib/analytics/aggregate.ts`（`buildTrendData`） | 正常系：マイナスの月 | 10,000→−1,000 | 棒0、金額−1,000円、注意書き用の一覧に入る、前月比なし | なし |

### E2Eテスト

**実施しない。**（ユーザー確認済み）画面操作の観点は [docs/支出分析機能/手動テスト仕様書.md](./支出分析機能/手動テスト仕様書.md)（フェーズ2：M-28〜M-45）で手動確認する。

---

## 追加機能：支出分析（フェーズ3：グラフからレシート一覧への絞り込み）

対象：[docs/支出分析機能/詳細設計書.md](./支出分析機能/詳細設計書.md)（フェーズ3）。テストフレームワーク: Vitest（単体）。
外部API・有料サービスへの通信は発生しない。取得項目の追加のみでRLS・期間の条件は変えないため、結合テストの追加はない。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-82 | `lib/analytics/drilldown.ts`（`matchReceipt`） | 正常系：カテゴリ指定 | 日用品で絞り込み、D-2（食費共同1,000＋日用品B1,000、支払額1,500）／D-1（食費のみ） | D-2は日用品の明細だけ・750円／D-1は該当なし | なし |
| U-83 | `lib/analytics/drilldown.ts` | 正常系：表示対象 | A（共同オフ／オン） | オフはD-2が該当なし／オンは共同の食費が375円。D-1の1,001円は500.5円 | なし |
| U-84 | `lib/analytics/drilldown.ts` | 正常系：按分・返金 | 支払額1,500円のD-2／返金2,000円 | 食費は750円／−2,000円 | なし |
| U-85 | `lib/analytics/drilldown.ts` | 正常系：分析との一致 | 2026年7月のD-1〜D-4、全体・A（共同オン）・B（共同オフ）×食費・日用品 | 絞り込みの合計が`buildAnalyticsRows`＋`sumByCategory`の値と一致する | なし |
| U-86 | `lib/receipts/list-params.ts` | 正常系／異常系：URLの読み取りと引き継ぎ | 正しい条件／不正なカテゴリ・ユーザー／openを含むパラメータ／移動元だけ | 条件と表示名（「A＋共同1/2」など）が作られる／無視されて絞り込みなし／openは引き継がない／絞り込みなしで移動元だけ読める。分析から一覧へのURLが作られる | なし |
| U-87 | `lib/receipts/queries.ts`（`listReceipts`） | 正常系：取得項目の追加 | 税別8%・税込の明細 | `categoryId`と`taxRateMultiplier`（1.08／null）が入る | Supabaseクライアント、`getGroupMembers` |
| U-88 | `lib/analytics/url-state.ts` | 正常系／異常系：分析画面の状態とURL | 全項目ありのURL／不正な値・空 | 読み直して書き出すと同じURL／初期値になる | なし |
| U-89 | `lib/receipts/list-view.ts`（`buildReceiptListView`） | 正常系：画面側での絞り込み・並び替え | 3件のレシート、絞り込みなし／食費で絞り込み、新しい順／古い順 | 全件が並び順どおり／当てはまる2件と合計3,000円。元の配列は並べ替えない | なし |
| U-90 | `lib/receipts/list-params.ts`（`buildFilteredListHref`・`buildAnalyticsReturnHref`） | 正常系／異常系：「← 分析に戻る」の戻り先 | 分析画面の状態付きの一覧URL／`https://evil…`・`//evil…`・`/admin?…`・状態以外の項目を含む`ret` | 状態付きの`/analytics?…`に戻せる／行き先は常に`/analytics`で、外部URLや状態以外の項目は含まれない | なし |
| U-91 | `lib/navigation/history-state.ts` | 正常系／異常系：共通の「戻る」ボタンの判定と履歴のメモ | 直前のパスと戻り先（クエリ違い・別の画面・記録なし）／記録の書き込み／URLの書き換え | パスが同じときだけ1つ前に戻る、記録がなければリンク／記録を読み出せる／URLを書き換えても記録が残り、Next.jsの項目（`__NA`）は渡さない | `window.history`（Node環境のため最小限を再現） |

### E2Eテスト

**実施しない。**（ユーザー確認済み）画面操作の観点は [docs/支出分析機能/手動テスト仕様書.md](./支出分析機能/手動テスト仕様書.md)（フェーズ3：M-46〜M-72）で手動確認する。

---

## 不具合修正：読み込み直後にアイコンが大きく表示される

対象：[docs/bug-reports/2026-10-04-fontawesome-icon-flash.md](./bug-reports/2026-10-04-fontawesome-icon-flash.md)。テストフレームワーク: Vitest（単体）。外部API・有料サービスへの通信は発生しない。

### 単体テスト

| No | テスト対象 | 観点 | 入力値 / 条件 | 期待結果 | モック対象 |
|---|---|---|---|---|---|
| U-125 | `lib/fontawesome.ts`・`app/layout.tsx` | 回帰：アイコンの CSS を最初から読み込む | `lib/fontawesome.ts` を読み込む／ルートのレイアウト | `config.autoAddCss` が false になる／レイアウトが `@/lib/fontawesome` を読み込んでいる | なし |

### E2Eテスト

**実施しない。**（ユーザー確認済み）次の手動確認で代える。

| No | 確認内容 | 期待結果 |
|---|---|---|
| BUG-M-01 | 開発者ツールのネットワークタブで「低速 4G」などに通信を遅くし、ヘッダーのある画面（分析・レシート一覧）と登録画面を再読み込みする（PC幅・スマホ幅） | 読み込み直後からアイコンが通常の大きさで表示され、大きく表示される瞬間がない |

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
