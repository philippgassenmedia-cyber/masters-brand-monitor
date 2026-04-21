import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DpmaScanClient } from "./dpma-scan-client";

export const dynamic = "force-dynamic";

export default async function DpmaScanPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  return (
    <AppShell user={auth.user}>
      <DpmaScanClient />
    </AppShell>
  );
}
