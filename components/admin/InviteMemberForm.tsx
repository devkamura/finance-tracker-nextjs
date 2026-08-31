"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { inviteGroupMember } from "@/lib/actions/invite-group-member";

type InviteMemberFormProps = {
  memberCount: number;
};

export function InviteMemberForm({ memberCount }: InviteMemberFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 要件定義書2.1/2.3章：1グループにつき管理者含め最大2人。
  if (memberCount >= 2) {
    return (
      <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
        グループの登録人数上限（管理者含め2人）に達しているため、これ以上ユーザーを追加できません。
      </p>
    );
  }

  const submit = () => {
    startTransition(async () => {
      const result = await inviteGroupMember(email);
      if (result.success) {
        setEmail("");
        setError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Input
            label="Gmailアドレスでユーザーを追加"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            placeholder="user@example.com"
            error={!!error}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          追加
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
