import { redirect } from "next/navigation";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DpmaSettingsClient } from "./dpma-settings-client";

export const dynamic = "force-dynamic";

export default async function DpmaSettingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const admin = getSupabaseAdminClient();

  const [accountsRes, subscriptionsRes, stemsRes] = await Promise.all([
    admin
      .from("imap_accounts")
      .select(
        "id, label, imap_host, imap_port, username, use_ssl, inbox_folder, processed_folder, review_folder, is_active, last_check_at, last_check_status, last_check_message, created_at",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("monitoring_subscriptions")
      .select("*")
      .order("created_at", { ascending: false }),
    admin
      .from("brand_stems")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <AppShell user={auth.user}>
      <DpmaSettingsClient
        accounts={accountsRes.data ?? []}
        subscriptions={subscriptionsRes.data ?? []}
        stems={stemsRes.data ?? []}
      />
    </AppShell>
  );
}
