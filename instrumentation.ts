// Vercelでは`TZ`が予約済み環境変数名のためダッシュボードから設定できない
// （docs/全体仕様書/運用手順.md 3.3節）。本アプリはJST運用のみを前提としており、
// レシートの日時（<input type="datetime-local">の解釈・DB保存・表示）は
// サーバーのローカルタイムゾーンに依存するため、サーバー起動時にコードで
// 明示的にJSTへ固定する。
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = "Asia/Tokyo";
  }
}
