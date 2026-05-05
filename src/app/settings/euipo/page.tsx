import { redirect } from "next/navigation";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { EuipoSettingsClient } from "./euipo-settings-client";

export const dynamic = "force-dynamic";

export default async function EuipoSettingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const admin = getSupabaseAdminClient();

  const [stemsRes, configRes, statsRes, stats30dRes] = await Promise.all([
    admin.from("brand_stems").select("id, stamm, aktiv, created_at").order("created_at", { ascending: true }),
    admin.from("settings").select("value").eq("key", "euipo_config").maybeSingle(),
    admin.from("trademarks").select("id", { count: "exact", head: true }).eq("quelle", "euipo"),
    admin
      .from("trademarks")
      .select("id", { count: "exact", head: true })
      .eq("quelle", "euipo")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
  ]);

  const rawConfig = (configRes.data?.value ?? {}) as Record<string, unknown>;

  return (
    <AppShell user={auth.user}>
      <EuipoSettingsClient
        config={{
          default_klassen: (rawConfig.default_klassen as string | undefined) ?? "36 37 42",
          nur_in_kraft: (rawConfig.nur_in_kraft as boolean | undefined) ?? false,
          zeitraum_monate: (rawConfig.zeitraum_monate as number | undefined) ?? 0,
        }}
        stems={stemsRes.data ?? []}
        stats={{
          total: statsRes.count ?? 0,
          last30d: stats30dRes.count ?? 0,
        }}
      />
    </AppShell>
  );
}
