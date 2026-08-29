import { MemberDisplayNameEditor } from "@/components/admin/MemberDisplayNameEditor";
import { RemoveMemberButton } from "@/components/admin/RemoveMemberButton";
import { updateInvitedMemberDisplayName } from "@/lib/actions/update-invited-member-display-name";
import { updateMemberDisplayName } from "@/lib/actions/update-member-display-name";

export type MemberView = {
  id: string;
  userId: string | null;
  role: "admin" | "member";
  email: string | null;
  displayName: string | null;
  joined: boolean;
};

export function MemberList({ members }: { members: MemberView[] }) {
  if (members.length === 0) {
    return <p className="text-sm text-slate-500">メンバーがいません。</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {member.joined ? (
                <MemberDisplayNameEditor
                  initialDisplayName={member.displayName ?? ""}
                  onSave={updateMemberDisplayName.bind(null, member.userId!)}
                />
              ) : (
                <>
                  <MemberDisplayNameEditor
                    initialDisplayName={member.displayName ?? ""}
                    placeholder="未設定"
                    onSave={updateInvitedMemberDisplayName.bind(
                      null,
                      member.id
                    )}
                  />
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                    招待中
                  </span>
                </>
              )}
            </div>
            {/* どのユーザーか判別できるよう、メールアドレスは参加状況に関わらず常に表示する。 */}
            <span className="text-xs text-slate-500">{member.email}</span>
          </div>
          {member.role === "admin" ? (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
              管理者
            </span>
          ) : (
            <RemoveMemberButton memberId={member.id} />
          )}
        </li>
      ))}
    </ul>
  );
}
