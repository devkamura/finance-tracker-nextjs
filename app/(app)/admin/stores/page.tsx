import { StoreManager } from "@/components/admin/StoreManager";
import { getCurrentMembership } from "@/lib/supabase/group";
import { createClient } from "@/lib/supabase/server";

export default async function AdminStoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = await getCurrentMembership(supabase, user!.id);

  const { data: stores, error } = await supabase
    .from("stores")
    .select("id, name")
    .eq("group_id", membership!.groupId)
    .order("name");
  if (error) {
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">店舗管理</h1>
      <StoreManager initialStores={stores ?? []} />
    </div>
  );
}
