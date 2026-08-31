import { PayeeManager } from "@/components/admin/PayeeManager";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPayeesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const { data: payees, error } = await supabase
    .from("payees")
    .select("id, name")
    .eq("group_id", membership!.groupId)
    .order("name");
  if (error) {
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">支払い先管理</h1>
      <PayeeManager initialPayees={payees ?? []} />
    </div>
  );
}
