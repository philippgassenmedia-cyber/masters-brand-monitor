import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import type { Hit, HitStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<HitStatus, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

function scoreBg(score: number | null) {
  if (score === null) return "bg-stone-100 text-stone-500";
  if (score >= 7) return "bg-rose-100 text-rose-800";
  if (score >= 4) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export default async function AllHitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const params = await searchParams;
  const sortBy = params.sort ?? "score";
  const statusFilter = params.status;

  let query = supabase
    .from("hits")
    .select("id, url, domain, title, company_name, ai_score, violation_category, status, first_seen_at, last_seen_at")
    .limit(2000);

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  if (sortBy === "new") {
    query = query.order("first_seen_at", { ascending: false });
  } else {
    query = query
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("first_seen_at", { ascending: false });
  }

  const { data, error } = await query;
  const hits = (data ?? []) as Pick<Hit, "id" | "url" | "domain" | "title" | "company_name" | "ai_score" | "violation_category" | "status" | "first_seen_at" | "last_seen_at">[];

  const sortLink = (s: string, label: string) => (
    <Link
      href={`/hits?sort=${s}${statusFilter ? `&status=${statusFilter}` : ""}`}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        sortBy === s
          ? "border-stone-300 bg-stone-900 text-white"
          : "border-white/70 bg-white/60 text-stone-600 hover:bg-white/90"
      }`}
    >
      {label}
    </Link>
  );

  const statusLink = (s: string, label: string) => (
    <Link
      href={`/hits?sort=${sortBy}&status=${s}`}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        (statusFilter ?? "all") === s
          ? "border-stone-300 bg-stone-900 text-white"
          : "border-white/70 bg-white/60 text-stone-600 hover:bg-white/90"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <AppShell user={auth.user}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-stone-900">Alle Treffer</h1>
          <p className="text-xs text-stone-500">{hits.length} Einträge</p>
        </div>
        <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">← Dashboard</Link>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-2 text-xs text-red-700">
          {error.message}
        </div>
      )}

      {/* Filter-Leiste */}
      <div className="mt-4 flex flex-wrap gap-2">
        {sortLink("score", "Score")}
        {sortLink("new", "Neueste zuerst")}
        <span className="border-l border-stone-200 mx-1" />
        {statusLink("all", "Alle")}
        {statusLink("new", "Neu")}
        {statusLink("reviewing", "In Prüfung")}
        {statusLink("confirmed", "Bestätigt")}
        {statusLink("dismissed", "Verworfen")}
      </div>

      {/* Tabelle */}
      <section className="glass mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Score</th>
                <th className="px-4 py-3 font-semibold">Domain / Firma</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">URL</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">Gesehen</th>
              </tr>
            </thead>
            <tbody>
              {hits.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-stone-400">
                    Keine Treffer gefunden.
                  </td>
                </tr>
              )}
              {hits.map((h) => (
                <tr key={h.id} className="border-t border-white/50 hover:bg-white/50 transition">
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${scoreBg(h.ai_score)}`}>
                      {h.ai_score ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/hits/${h.id}`} className="font-medium text-stone-900 hover:text-stone-600 hover:underline">
                      {h.company_name ?? h.domain}
                    </Link>
                    <div className="text-[11px] text-stone-400">{h.domain}</div>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="max-w-xs block truncate text-[11px] text-stone-400 hover:text-stone-700"
                    >
                      {h.url}
                    </a>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-stone-600 ring-1 ring-white">
                      {STATUS_LABEL[h.status] ?? h.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell text-[11px] text-stone-400">
                    {new Date(h.first_seen_at).toLocaleDateString("de-DE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
