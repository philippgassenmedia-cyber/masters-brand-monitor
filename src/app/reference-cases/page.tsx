import { redirect } from "next/navigation";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ReferenceCasesClient } from "./reference-cases-client";

export const dynamic = "force-dynamic";

export default async function ReferenceCasesPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const db = getSupabaseAdminClient();
  const { data: cases } = await db
    .from("reference_cases")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <AppShell user={auth.user}>
      <ReferenceCasesClient initialCases={cases ?? []} />
    </AppShell>
  );
}
