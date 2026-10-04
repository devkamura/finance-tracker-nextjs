// Font Awesome の設定（docs/bug-reports/2026-10-04-fontawesome-icon-flash.md）。
// 標準ではアイコンの大きさを決める CSS を JavaScript が動いてから追加するため、
// ページを開いた直後にアイコンが大きく表示されてしまう。CSS はここで最初から読み込み、
// JavaScript での自動追加は止める。ルートのレイアウト（app/layout.tsx）で読み込む。
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";

config.autoAddCss = false;
