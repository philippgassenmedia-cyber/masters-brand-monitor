import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { RemoveButton } from "./remove-button";

export const dynamic = "force-dynamic";

interface ExcludedRow { domain: string; reason: string | null; created_at: string; }

export default async function ExcludedPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data } = await supabase.from("excluded_domains").select("domain, reason, created_at").order("created_at", { ascending: false });
  const rows = (data ?? []) as ExcludedRow[];

  return (
    <AppShell user={auth.user}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Ausgeschlossene Domains</h1>
          <p className="mt-1 text-sm text-stone-600">Gehören der eigenen Marke und werden bei zukünftigen Scans ignoriert.</p>
        </div>
        <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">← Dashboard</Link>
      </header>
      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-5 py-3">Domain</th>
              <th className="px-5 py-3">Grund</th>
              <th className="px-5 py-3">Hinzugefügt</th>
              <th className="px-5 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-stone-500">Keine Domains ausgeschlossen.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.domain} className="border-t border-white/50">
                <td className="px-5 py-3 font-semibold text-stone-900">{r.domain}</td>
                <td className="px-5 py-3 text-stone-600">{r.reason ?? "—"}</td>
                <td className="px-5 py-3 text-[11px] text-stone-500">{new Date(r.created_at).toLocaleDateString("de-DE")}</td>
                <td className="px-5 py-3 text-right"><RemoveButton domain={r.domain} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
