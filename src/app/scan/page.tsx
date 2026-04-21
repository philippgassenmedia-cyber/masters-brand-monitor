import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ScanClient } from "./scan-client";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  return (
    <AppShell user={auth.user}>
      <ScanClient />
    </AppShell>
  );
}
