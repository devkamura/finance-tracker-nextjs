import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">管理画面</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/admin/users"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300"
        >
          <h2 className="font-semibold text-slate-900">ユーザー管理</h2>
          <p className="mt-1 text-sm text-slate-500">
            グループのメンバー追加・ユーザー名の編集
          </p>
        </Link>
        <Link
          href="/admin/payees"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300"
        >
          <h2 className="font-semibold text-slate-900">支払い先管理</h2>
          <p className="mt-1 text-sm text-slate-500">
            グループで使用する支払い先の登録・編集
          </p>
        </Link>
        <Link
          href="/settlement"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-indigo-300"
        >
          <h2 className="font-semibold text-slate-900">精算</h2>
          <p className="mt-1 text-sm text-slate-500">
            月次精算の確認・確定・再オープン
          </p>
        </Link>
      </div>
    </div>
  );
}
