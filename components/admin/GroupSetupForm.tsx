"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createGroup } from "@/lib/actions/create-group";

export function GroupSetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await createGroup(name);
      if (result.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        label="グループ名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={isPending}
        autoFocus
        error={!!error}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isPending}>
        グループを作成する
      </Button>
    </form>
  );
}
