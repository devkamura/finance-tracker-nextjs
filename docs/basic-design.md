# 基本設計書（コア機能）

対象要件定義書：[docs/家計簿アプリ 要件定義書.md](./家計簿アプリ%20要件定義書.md)

---

## 0. 本書の位置づけ・対象スコープ

要件定義書は1〜36章と非常に広範なため、ユーザーと合意の上で以下のとおりスコープを区切る。

### 0.1 前提として確定した方針

| 論点 | 決定事項 |
|---|---|
| データ保存方式 | レシート・明細はSupabase(PostgreSQL)のDBに保存する方式に一本化する。既存の「管理者のGoogle DriveへJSONアップロード」経路は廃止する。 |
| レシート画像の保存先 | Supabase Storageに保存する。 |
| 既存マスタ「シーン」（`scenes`） | 廃止せず維持する。明細に対して複数選択可能な任意タグとして引き続き扱う。 |
| 既存マスタ「支出/返金」区分（`transaction_types`） | 維持する。**返金の場合、精算・集計上の金額はすべて符号反転（マイナス）で計算する**（詳細は5章）。 |
| 精算の確定 | 精算は都度計算するだけでなく、**月単位で「確定」操作を設ける**。確定後は当該月のレシートを編集・削除不可にする。**管理者のみ「再オープン」操作が可能**で、再オープン後はレシートの編集・削除・追加ができ、再度確定し直せる（詳細は5.5章）。 |
| 明細合計と実支払額の不一致時の扱い | [docs/明細金額・実支払額・精算に関する要件.md](./明細金額・実支払額・精算に関する要件.md)のルールに従う：**支出分析は明細金額をそのまま使用**し、**精算は実支払額を明細金額の比率で按分**する（詳細は5章）。 |
| レシートの編集・削除 | コア機能のスコープに含める。 |
| 支払者 | 登録時は常にログイン中の登録者本人が自動設定される。**編集画面からは全メンバーが変更可能**（2026-09-01追記。詳細は2.4章）。 |

### 0.2 今回の設計対象（コア機能）

要件定義書の章でいうと以下を対象とする。

- 3章：カテゴリ・目的・支払者・帰属先の4軸モデル
- 4〜7章：カテゴリ・目的の定義（マスタ内容の追加検討は含むが、判定ロジックの自動化＝お助け機能は含まない）
- 8〜14章：レシート/明細の分離、レシート画像管理、複数帰属先の許容、支払者と帰属先の分離
- 15〜19章：負担額・実支払額・個人立替・最終精算の計算
- 20〜22章：税込／税別、明細合計と支払額の不一致許容、支払額を精算基準とする方針
- 35〜36章：データモデル・設計原則

あわせて、上記を成立させるために最低限必要な「登録したレシートを見返す」ための**簡易レシート一覧・詳細画面**（12章・34章の最小範囲）と、**精算結果を確認する画面**（19章）を設計対象に含める。

### 0.3 次フェーズ送り（今回の設計対象外）

- 23〜27章：分類支援「お助け」機能（ルールベース対話＋Geminiフォールバック）
- 28〜31章：月次カテゴリ別集計・過去12か月推移グラフ・分析軸切り替え
- 32〜33章：任意フィルタによる自由集計
- 34章の高度な部分：複数条件フィルタ付き履歴検索UI

これらは別途、追加の基本設計フェーズで扱う。

---

## 1. 全体アーキテクチャ

既存構成（Next.js App Router + Server Actions + Supabase）を踏襲し、変更点は以下のみ。

```text
[変更前]
レシートフォーム → Server Action(submitReceipt)
                     → buildReceiptJson（マスタ名を解決してJSON化）
                     → uploadJsonToDrive（グループ管理者のGoogle Driveへ保存）
                     ※画像はGemini OCRに一時送信されるのみで保存されない
                     ※DBには何も保存されない

[変更後]
レシートフォーム → Server Action(createReceipt)
                     → レシート画像をSupabase Storageへアップロード（任意）
                     → receipts / receipt_details / receipt_detail_scenes へINSERT
                     ※Google Driveアップロードは廃止
```

Gemini OCR（`lib/gemini/extract-receipt.ts`）自体は変更しない。OCRは「画像から商品名・金額を抽出するだけ」という役割（27章）を維持し、抽出結果をフォームに反映するところまでは既存のまま。

---

## 2. データベース設計

### 2.1 ER図（テキスト）

```text
groups ──< group_members >── auth.users(profiles)
  │
  ├──< payees（既存）
  │
  └──< receipts
         ├─ payee_id ─────────────→ payees
         ├─ transaction_type_id ──→ transaction_types（既存）
         ├─ payer_user_id ────────→ auth.users
         └──< receipt_details
                ├─ tax_rate_id ────→ consumption_taxes（既存）
                ├─ category_id ────→ categories（既存）
                ├─ purpose_id ─────→ purposes（既存）
                ├─ owner_user_id ──→ auth.users（NULL=共同）
                └──< receipt_detail_scenes >── scenes（既存）
```

### 2.2 テーブル定義

#### `receipts`（レシート＝1回の会計）

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| group_id | uuid | not null, FK groups(id) on delete cascade | |
| payee_id | bigint | FK payees(id), nullable | マスタ選択時のみ設定 |
| payee_name | text | not null | 表示用スナップショット。マスタ選択時は解決した支払い先名、自由入力時はその文字列をそのまま保存（後でマスタの支払い先名が変更されても過去レシートの表示が変わらないようにする） |
| transaction_type_id | bigint | not null, FK transaction_types(id) | 支出/返金 |
| occurred_at | timestamptz | not null | 購入日時 |
| payer_user_id | uuid | not null, FK auth.users(id) | 支払者。**登録時のみ**登録者本人（=created_by）と同じ値を自動設定する（選択UIなし）。編集画面からは全メンバーが任意のグループメンバーに変更できる（2.4章）。 |
| amount | integer | not null, check (amount >= 0) | 支払額（実支払額）。要件書「明細金額・実支払額・精算に関する要件」6章のとおり、レシートの金額項目はこの1つのみとし、別名の合計金額フィールドは設けない。常に正の値で保存し、返金かどうかはtransaction_type_idで判定する |
| receipt_image_path | text | nullable | Supabase Storage上のオブジェクトパス |
| created_by | uuid | not null, FK auth.users(id) | 登録者（=payer_user_idと常に同一） |
| created_at / updated_at | timestamptz | not null default now() | |

#### `receipt_details`（明細）

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| receipt_id | uuid | not null, FK receipts(id) on delete cascade | |
| item_name | text | not null | |
| price | integer | not null, check (price >= 0) | 常に正の値で保存 |
| tax_type | text | not null, check in ('inclusive','exclusive') | 税込／税別 |
| tax_rate_id | bigint | FK consumption_taxes(id), nullable | 税別の場合は必須（check制約で相関チェック） |
| category_id | bigint | not null, FK categories(id) | |
| purpose_id | bigint | not null, FK purposes(id) | |
| owner_user_id | uuid | FK auth.users(id), nullable | 帰属先。NULL＝共同 |
| created_at / updated_at | timestamptz | not null default now() | |

チェック制約：`(tax_type = 'exclusive' and tax_rate_id is not null) or (tax_type = 'inclusive' and tax_rate_id is null)`

#### `settlement_periods`（月次精算の確定記録）

精算は基本的に都度計算（DBに保持しない）だが、「確定」した月だけはスナップショットを保存し、以後は再計算しても値が変わらないようにする。管理者は確定済みの月を「再オープン」でき、再オープン中はレシートの編集・削除・追加が可能になる。再オープン後、再確定するとスナップショットは最新の値で上書きされる（過去の確定履歴は保持しない）。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| group_id | uuid | not null, FK groups(id) on delete cascade | |
| period_month | date | not null | 対象月の1日（例：2026-08-01）で表す |
| status | text | not null default 'confirmed', check in ('confirmed','reopened') | `confirmed`の間だけレシートをロックする |
| user_a_id / user_b_id | uuid | not null, FK auth.users(id) | 確定時点のグループメンバー2人 |
| user_a_burden / user_b_burden | integer | not null | 確定時点の負担額（5章のロジックで算出したスナップショット） |
| user_a_paid / user_b_paid | integer | not null | 確定時点の実支払額 |
| settlement_amount | integer | not null, check (settlement_amount >= 0) | 精算額（絶対値） |
| settlement_from_user_id / settlement_to_user_id | uuid | not null, FK auth.users(id) | 誰が誰に支払うか |
| confirmed_by | uuid | not null, FK auth.users(id) | 直近の確定操作を行ったユーザー |
| confirmed_at | timestamptz | not null default now() | 直近の確定日時（再確定時に更新） |
| reopened_by | uuid | FK auth.users(id), nullable | 直近の再オープン操作を行った管理者 |
| reopened_at | timestamptz | nullable | 直近の再オープン日時 |

ユニーク制約：`(group_id, period_month)`（1グループにつき1か月1レコード。再確定は既存行のUPDATEで行う）

#### `receipt_detail_scenes`（明細×シーン 中間テーブル）

| カラム | 型 | 制約 |
|---|---|---|
| receipt_detail_id | uuid | not null, FK receipt_details(id) on delete cascade |
| scene_id | bigint | not null, FK scenes(id) |

PK: (receipt_detail_id, scene_id)

### 2.3 owner_user_id / payer_user_id の妥当性検証について

`payer_user_id`・`owner_user_id`は「そのグループに所属する2人のうちのどちらか」に限定される必要があるが、既存の`payee_id`のグループ整合性同様、**DB制約ではなくアプリケーション層（Server Action）でグループメンバーかどうかを検証する**方針とする（既存の`validateReceiptForm`と同じ思想）。DBレベルでの相関チェック（他テーブルを参照するcheck制約）はPostgresでは直接書けないため、素直にアプリ層検証とする。

### 2.4 支払者の編集（2026-09-01追記）

編集画面から支払者を変更できるほうが便利という要望を受け、当初設けていた`receipts_payer_is_creator`check制約（`payer_user_id = created_by`を強制）を撤廃した（`20260901000001_receipt_payer_editable.sql`）。権限は限定せず、グループの全メンバーが変更できる。変更履歴の記録は今回のスコープでは見送り、必要になった時点で改めて検討する。

---

## 3. RLS設計

既存の`payees`・`groups`と同じ「`my_group_ids()`による所属グループ判定」パターンを踏襲する。

```sql
-- 指定グループ・指定日時の月がすでに精算確定済みかどうかを判定する。
-- receipts/receipt_detailsの書き込みポリシーから参照し、確定済み月への
-- 追加・変更・削除をDBレベルでブロックする。
create or replace function public.is_settlement_confirmed(p_group_id uuid, p_occurred_at timestamptz)
returns boolean
language sql
stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.settlement_periods
    where group_id = p_group_id
      and period_month = date_trunc('month', p_occurred_at)::date
      and status = 'confirmed'
  );
$$;

-- receipts: 所属グループのメンバーなら誰でも読み書き可能（支払い先管理と異なり管理者限定にしない。
-- 2人とも自分の支出を登録する必要があるため）。ただし確定済み月は書き込み不可。
create policy "member can read own group receipts"
  on public.receipts for select
  to authenticated
  using (group_id in (select public.my_group_ids()));

create policy "member can write own group receipts"
  on public.receipts for all
  to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (
    group_id in (select public.my_group_ids())
    and not public.is_settlement_confirmed(group_id, occurred_at)
  );

-- receipt_details / receipt_detail_scenes は receipts 経由でグループ判定・確定判定する
create policy "member can read own group receipt_details"
  on public.receipt_details for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id
        and r.group_id in (select public.my_group_ids())
    )
  );
-- write系も同様のexistsパターンで、あわせて is_settlement_confirmed もチェックする

-- settlement_periods: 所属グループのメンバーなら参照可。
-- 確定・再オープンともにRPC経由に限定する（直接INSERT/UPDATEポリシーは設けない）。
-- 再オープンはconfirm_settlement()と対になるreopen_settlement()をSECURITY DEFINERで用意し、
-- 呼び出し時にis_group_admin(group_id)を検証することで管理者限定とする。
create policy "member can read own group settlement_periods"
  on public.settlement_periods for select
  to authenticated
  using (group_id in (select public.my_group_ids()));
```

---

## 4. Supabase Storage設計

- バケット名：`receipt-images`（非公開バケット）
- パス構成：`{group_id}/{receipt_id}/{uuid}.{ext}`
- アクセス制御：`storage.objects`に対し、パス先頭の`group_id`セグメントが`my_group_ids()`に含まれる場合のみ read/write を許可するポリシーを追加する（`payees`等と同じ関数を再利用）。
- アップロードのタイミング：レシート登録の確定操作時に、DBのINSERTとあわせて行う。Storageアップロード→受け取ったpathをreceiptsに保存、の順で実装し、DB INSERT失敗時はStorage側のオブジェクトを削除するロールバック処理を入れる。
- 画像の差し替え・削除：`updateReceipt`で画像を差し替えた場合や`deleteReceipt`実行時は、Supabase Storage上の旧オブジェクトを同期的に削除する。

---

## 5. 支出計算ロジック仕様

[docs/明細金額・実支払額・精算に関する要件.md](./明細金額・実支払額・精算に関する要件.md)により、「支出分析」と「精算」で使用する金額が明確に分離された。**本フェーズでは精算計算のみが対象**であり、支出分析（月次集計・カテゴリ別集計等）は次フェーズで別途設計する。

### 5.1 返金の扱い

`transaction_type`が「返金」のレシートは、**集計・精算時に金額をマイナスとして扱う**。

- DB上の`amount`（レシート）・`price`（明細）は常に正の値で保存する。
- 按分計算（5.2節）自体は「支出」「返金」を区別せず、通常どおり正の値のまま行う。
- 符号反転は、**按分結果を最終指標（負担額・実支払額・立替額）へ集計する最後の段階でのみ**適用する：「支出」なら加算、「返金」なら減算する。

```text
レシート
  ↓
明細を通常どおり処理（按分含む、5.2節）
  ↓
実支払額を明細比率で按分した allocated(detail) を算出
  ↓
「返金」なら、その結果をマイナスとして集計する（5.4節）
```

例：支出3,000円のレシートと返金1,000円のレシートがある場合、集計額は`3,000 − 1,000 = 2,000円`となる。

### 5.2 レシート単位の按分計算（明細金額・要件4章）

精算計算の起点として、レシートごとに「支払額（実支払額）」を各明細の金額比率で按分した`allocated(detail)`を算出する。「支出」「返金」の区別はここでは行わず、常に正の値として計算する。**この按分後の金額のみを精算計算に使用し、支出分析（次フェーズ）では按分前の`price(detail)`をそのまま使用する**（分析と精算の分離）。

```text
detailTotal(receipt) = Σ price(detail)  ※そのレシートに属する全明細の合計
ratio(detail)         = price(detail) / detailTotal(receipt)
allocated(detail)     = round(receipt.amount × ratio(detail))   ※端数処理は5.3節参照
```

例（要件書の例をそのまま反映）：食品1,000円(共同)・化粧品1,000円(ユーザーB)、明細合計2,000円、支払額1,500円の場合、
`ratio`はそれぞれ50%、`allocated`はそれぞれ750円となる。

`detailTotal(receipt) = 0`（明細金額が全て0円等）の場合は按分不能なため、`allocated(detail) = 0`として扱う（実質的にそのレシートは精算に影響しない）。

### 5.3 端数処理

- 税別明細の税込換算：`floor(price × consumption_taxes.multiplier)`（20章のとおり切り捨て）
- 5.2節の按分計算の端数：明細ごとに`floor`で切り捨てたうえで、`receipt.amount − Σ floor(allocated(detail))`で生じた余り（端数の合計）を、**金額が最も大きい明細から順に1円ずつ加算する（最大剰余法）**。これにより`Σ allocated(detail) = receipt.amount`が常に成立し、22章の「支払額を上限とする」という原則を按分レベルで自動的に満たす。

### 5.4 各指標の算出式（対象期間内の全レシート・明細に対して集計）

集計の最終段階で、5.1節のとおり「返金」レシートに属する値の符号を反転させる。

```text
signedAllocated(detail) = allocated(detail) × (detailが属するreceiptが返金 ? -1 : 1)
signedAmount(receipt)   = receipt.amount    × (receiptが返金 ? -1 : 1)
```

| 指標 | 算出式 |
|---|---|
| ユーザー別負担額（精算用） | `signedAllocated(detail)`を`owner_user_id`で集計。owner=NULL（共同）は対象ユーザーに`signedAllocated × 0.5`、owner=対象ユーザーは`signedAllocated × 1.0`を加算 |
| ユーザー別実支払額 | `receipts`を`payer_user_id`で集計し、`signedAmount`をそのまま加算（明細には依存しない＝17章のとおり） |
| 個人立替額 | `signedAllocated(detail)`を「所属する`receipts.payer_user_id`」と「`owner_user_id`」の組み合わせで集計し、両者が異なる（かつownerがNULLでない）明細の`signedAllocated`を合計 |
| 精算差額（ユーザー） | `実支払額 − 負担額` |
| 最終精算 | 2人のうち精算差額がマイナスの人が、プラスの人へ絶対値分を支払う |

（参考：次フェーズで設計する支出分析（カテゴリ別集計等）は、上記の`allocated`ではなく按分前の`price(detail)`に同じ符号反転ルールを適用したものを使用する。）

### 5.5 精算の月次確定・再オープン

- 精算画面（6.3節）から、対象月の「確定」操作を行うと、その時点の計算結果を`settlement_periods`に`status='confirmed'`のスナップショットとして保存する（RPC `confirm_settlement`）。
- 確定後（`status='confirmed'`の間）は、その月（`occurred_at`が該当月に含まれる）のレシートの新規登録・編集・削除をRLSレベルでブロックする（3章の`is_settlement_confirmed`参照）。
- **管理者のみ**、確定済みの月を「再オープン」できる（RPC `reopen_settlement`、`is_group_admin`で検証）。再オープンすると`status='reopened'`になり、その月のレシートを再び編集・削除・追加できるようになる。
- 再オープン中の月は、精算画面上は「未確定」として扱われ、レシートの変更内容を反映した最新の値を都度計算で表示する。
- 再オープンした月を改めて「確定」すると、`settlement_periods`の同一行を`status='confirmed'`・最新のスナップショット値・`confirmed_by`/`confirmed_at`で更新する（再確定時に前回確定時の値は上書きされ、確定履歴自体は保持しない）。

---

## 6. 画面設計

### 6.1 レシート登録画面（既存拡張）

既存の`ReceiptForm` / `ReceiptUnitSection` / `ReceiptItemCard`を以下のとおり拡張する。

- 支払者は選択UIを設けず、常にログイン中のユーザー本人が`payer_user_id`（＝`created_by`）として自動設定される
- `ReceiptItemCard`（明細単位の入力）に「帰属先」選択（共同 / ユーザーA / ユーザーB の3択）を追加
- 画像アップロード欄を追加（OCRに使った画像をそのまま保存対象にできるようにする。OCRを使わず画像だけ保存するケースにも対応）
- 送信ボタンの文言を「Google Driveへ送信」から「登録する」等に変更
- 確定済み月（5.5節）に対する登録は、Server Action側でエラーを返す（フォーム自体は表示するが送信時に「この月の精算は確定済みのため登録できません。管理者に再オープンを依頼してください」等のメッセージを表示する）

### 6.2 レシート一覧・詳細画面（新規・簡易版）

34章の一覧項目（日付・支払い先・支払額・カテゴリ・目的・帰属先・支払者）と12章の詳細画面を実装する。自由記述フィルタ（32〜33章）は次フェーズ送りとし、まずは「当月」等の期間指定のみ対応する簡易版とする。

```text
[一覧画面]
2026/08/31  ○○スーパー  支払額 3,500円  支払者: A
2026/08/30  △△ドラッグストア  支払額 1,200円  支払者: B
  ...
（タップで詳細へ）

[詳細画面]
2026/08/31 ○○スーパー
支払額：3,500円　支払者：A

明細
----------------
食費(生活維持/共同)       2,000円
日用品(生活維持/共同)     1,000円
個人(個人/A)                 500円

[ レシート画像を見る ]

[ 編集する ]　[ 削除する ]
```

詳細画面から編集・削除を行えるようにする。ただし、そのレシートの属する月がすでに精算確定済み（5.5節）の場合は、編集・削除ボタンを非活性にし「この月の精算は確定済みのため変更できません。管理者に再オープンを依頼してください」と表示する。

### 6.3 精算画面（新規）

期間指定（デフォルト：当月、暦月単位＝28章の定義に準拠）で以下を表示する。

```text
2026年8月の精算

           A          B
負担額     15,000円   15,000円
実支払額   20,000円   10,000円
個人立替   （Aが立て替えたBの分）
---------------------------------
精算差額   +5,000円   -5,000円

→ BはAに5,000円支払う

[ この月の精算を確定する ]
```

- 未確定の月（初回、または再オープン中）：都度計算した最新の値を表示し、「確定する」ボタンを表示する。確定を押すと確認モーダルを挟んだ上で`settlement_periods`にスナップショットを保存し、以後その月のレシートはロックされる。
- 確定済みの月：`settlement_periods`のスナップショット値をそのまま表示し、「確定日時：2026/09/03」等を表示する。確定ボタンの代わりに「再オープンする」ボタンを表示する（**管理者のみ活性**。一般ユーザーには非活性＋「管理者のみ操作できます」の説明を表示）。再オープンを押すと確認モーダルを挟んだ上でその月のロックを解除する。

---

## 7. Server Actions設計

| Action | 役割 | 置き換え対象 |
|---|---|---|
| `createReceipt` | フォーム入力を検証し、画像アップロード＋`receipts`/`receipt_details`/`receipt_detail_scenes`へINSERT。対象月が確定済みならエラー | 既存`submitReceipt`を置き換え |
| `updateReceipt(receiptId)` | レシート・明細の更新（画像差し替え含む）。対象月が確定済みならエラー | 新規 |
| `deleteReceipt(receiptId)` | レシート削除（Storage上の画像も合わせて削除）。対象月が確定済みならエラー | 新規 |
| `listReceipts(period)` | 一覧画面用のレシート一覧取得 | 新規 |
| `getReceiptDetail(receiptId)` | 詳細画面用のレシート＋明細＋画像URL取得 | 新規 |
| `getSettlementSummary(period)` | 精算画面用の集計（5章のロジック）。対象月が確定済み（`status='confirmed'`）なら`settlement_periods`のスナップショットを返す | 新規 |
| `confirmSettlement(period)` | 対象月の精算を確定し、`settlement_periods`へスナップショットをUPSERTするRPC（SECURITY DEFINER、`groups`の`create_group_with_admin`と同じ思想） | 新規 |
| `reopenSettlement(period)` | 確定済みの月を再オープンするRPC（`is_group_admin`を検証し、管理者以外はエラー） | 新規 |

`extractReceiptOcr`（Gemini OCR呼び出し）はそのまま維持する。

---

## 8. 既存コードへの影響・移行方針

- `consumption_taxes`マスタ：既存実装は「税込／税別(8%)／税別(10%)／税なし」を1つの選択肢として持たせていたが、要件定義書20章の「税込／税別をtax_typeとして別軸管理し、税別の場合のみ税率を選ぶ」設計と食い違うため、税率のみ（8%・10%）を保持するマスタに整理した（`税込`・`税なし`はどちらも乗率1.00で計算上区別不要なため、tax_type='inclusive'側に統合）。
- `lib/actions/submit-receipt.ts` → `createReceipt`へ置き換え（Google Driveアップロード処理を削除）
- `lib/google/build-receipt-json.ts` → 不要になるため削除
- `lib/google/drive-client.ts` の `uploadJsonToDrive` はレシート機能では不要になるが、招待・認証まわり等の他機能で使っていないか確認の上、未使用であれば削除する
- `types/receipt.ts`の`ReceiptItem`に`ownerUserId`（帰属先）を追加し、`ReceiptFormState`に画像ファイルを追加する。支払者はユーザー入力ではないため`ReceiptFormState`には持たせず、`createReceipt`内で`auth.uid()`から設定する
- `lib/validation/receipt-rules.ts`に帰属先のバリデーション（グループメンバーであること、または共同＝null）を追加

---

## 9. 要確認事項一覧

前回の4点はすべて確認済みで、本文に反映した。

1. 按分の端数配分（5.3節）→ 最大剰余法で確定。
2. 確定済み精算の再オープン（5.5節）→ 必要。**管理者のみ**再オープン可能とし、`settlement_periods.status`で管理する設計に変更した。
3. 確定済み月への後からの登録 → 原則不可。必要な場合は管理者が再オープンしてから登録・修正し、再度確定し直す（再集計可能）運用とする。
4. 画像差し替え・削除時のStorageクリーンアップ → 同期削除で確定（4章に反映）。

現時点で未解決の設計論点はない。次のステップとして、この基本設計に基づく実装（マイグレーション作成→Server Actions実装→画面実装→テスト）に着手してよいか、最終確認をお願いしたい。
