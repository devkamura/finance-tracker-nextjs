import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

// 複製登録アイコンの説明文。「◯◯さんが複製登録した」ことを伝え、相方に内容確認を促す。
export function duplicatedMessage(createdByDisplayName: string): string {
  return `${createdByDisplayName}さんが複製登録したレシートです。内容を確認してください。`;
}

type DuplicatedBadgeProps = {
  createdByDisplayName: string;
};

// 相方分の同時登録（複製登録）で作られたレシートに付ける、色付きの「複製」アイコン。
// 一覧の行はそれ自体がボタンのため、入れ子にならないようspan＋titleでホバー説明を出す
// （タップ時は行を展開した中に説明文を表示する）。
export function DuplicatedBadge({ createdByDisplayName }: DuplicatedBadgeProps) {
  const message = duplicatedMessage(createdByDisplayName);
  return (
    <span
      title={message}
      aria-label={message}
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white"
    >
      <FontAwesomeIcon icon={faCopy} className="text-[10px]" />
      複製
    </span>
  );
}

// 展開時・詳細画面に表示する説明文のボックス。
export function DuplicatedNotice({ createdByDisplayName }: DuplicatedBadgeProps) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
      <FontAwesomeIcon icon={faCopy} />
      {duplicatedMessage(createdByDisplayName)}
    </p>
  );
}
