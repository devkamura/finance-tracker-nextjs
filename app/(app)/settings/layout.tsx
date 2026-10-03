import { SettingsTabs } from "@/components/settings/SettingsTabs";

// 設定画面の共通の枠（docs/分析拡充/基本設計書.md 2.1〜2.2節）。
// 設定画面はメンバー全員が開ける。編集できるかどうかは各画面で権限に応じて出し分ける。
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">設定</h1>
      <SettingsTabs />
      {children}
    </div>
  );
}
