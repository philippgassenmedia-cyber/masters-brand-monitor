import { redirect } from "next/navigation";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  // Fetch settings from the settings table
  const admin = getSupabaseAdminClient();
  const { data: rows } = await admin
    .from("settings")
    .select("key, value");

  const settings: Record<string, unknown> = {};
  for (const row of rows ?? []) {
    try {
      settings[row.key as string] =
        typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    } catch {
      settings[row.key as string] = row.value;
    }
  }

  return (
    <AppShell user={auth.user}>
      <SettingsClient
        initialSettings={settings}
        userEmail={auth.user.email ?? ""}
      />
    </AppShell>
  );
}
