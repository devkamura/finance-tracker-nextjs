// 画面内の「戻る」ボタン（components/navigation/BackLink.tsx）のための、履歴のメモ（history.state）の扱い。
// docs/支出分析機能/詳細設計書.md フェーズ3 4章。
//
// 各履歴エントリに「直前にいた画面のパス」を記録し、「戻る」ボタンは
//   - 直前にいた画面が戻り先と同じ → 1つ前に戻る（通信なし・状態もそのまま）
//   - それ以外（URLを直接開いた、編集を保存した後など） → 戻り先へのリンクとして開く
// と動く（アプリ内から来たときだけ1つ前に戻る、スマホ向けWebアプリで一般的な作り）。
//
// 【Next.jsへの依存とリスク】history.state はNext.jsも内部で使っている（__NA など）。
// Next.jsはreplaceStateを差し替えており、渡したオブジェクトに自分の項目をコピーしてから保存する
// （node_modules/next/dist/client/components/app-router.js の copyNextJsInternalHistoryState）。
// そのため、ここでは自分の項目だけを渡し、Next.jsの項目は渡さない（渡すとURLの同期がされなくなる）。
// 公式に案内された使い方ではないため、Next.jsの更新で記録が消えることがありうる。その場合でも
// 「リンクとして開く」になるだけで、戻り先は正しい（手動テスト仕様書のNext.js更新時の確認項目を参照）。
// 履歴のメモに触る処理はこのファイルに集約し、他の場所から直接 history.state を読み書きしない。

// アプリ独自の項目のキー（Next.jsの項目と衝突しない名前にする）
const PREV_PATH_KEY = "__appPrevPath";

type AppHistoryState = { [PREV_PATH_KEY]?: string };

// 現在の履歴エントリから、アプリ独自の項目だけを取り出す。
function currentAppState(): AppHistoryState {
  const state = window.history.state as Record<string, unknown> | null;
  const prevPath = state?.[PREV_PATH_KEY];
  return typeof prevPath === "string" ? { [PREV_PATH_KEY]: prevPath } : {};
}

// 現在の履歴エントリに記録された「直前にいた画面のパス」を返す。記録がなければnull。
export function getPrevPath(): string | null {
  return currentAppState()[PREV_PATH_KEY] ?? null;
}

// 現在の履歴エントリに「直前にいた画面のパス」を記録する（URLは変えない）。
export function recordPrevPath(path: string): void {
  window.history.replaceState({ ...currentAppState(), [PREV_PATH_KEY]: path }, "");
}

// 履歴を増やさずにURLだけを書き換える。アプリ独自の項目（直前の画面の記録）は残す。
// 画面の状態をURLに反映するときは、window.history.replaceState を直接呼ばずにこれを使う。
export function replaceUrlKeepingAppState(url: string): void {
  window.history.replaceState(currentAppState(), "", url);
}

// 「戻る」ボタンを押したときに、1つ前に戻るかどうかを判定する。
// 戻り先（href）のパスと、直前にいた画面のパスが同じときだけ1つ前に戻る。
// 月や絞り込みなどのクエリの違いは見ない（戻った先の画面は自分の状態をURLから復元する）。
export function shouldGoBack(prevPath: string | null, href: string): boolean {
  if (prevPath === null) return false;
  const targetPath = new URL(href, "http://localhost").pathname;
  return prevPath === targetPath;
}
