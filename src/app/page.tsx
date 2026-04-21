import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { Sparkline } from "@/components/sparkline";
import { groupHits, resolveCompany } from "@/lib/dedupe";
import { HitsTable, type HitGroupRow } from "@/components/hits-table";
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

interface ScanRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  region: string | null;
  triggered_by: string | null;
  queries_run: number;
  raw_results: number;
  new_hits: number;
  updated_hits: number;
  status: string;
}

function dayBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDailySeries(timestamps: string[], days = 14): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets[dayBucket(d)] = 0;
  }
  for (const t of timestamps) {
    const key = dayBucket(new Date(t));
    if (key in buckets) buckets[key]++;
  }
  return Object.values(buckets);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: HitStatus | "all";
    minScore?: string;
    maxScore?: string;
  }>;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const params = await searchParams;
  const minScore = Number(params.minScore ?? 0);
  const maxScore = Number(params.maxScore ?? 0);
  const showAll = params.status === "all";

  // Alle Queries parallel starten statt sequentiell
  let filteredQuery = supabase
    .from("hits")
    .select("*")
    .order("ai_score", { ascending: false, nullsFirst: false })
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (params.status && params.status !== "all") {
    filteredQuery = filteredQuery.eq("status", params.status);
  } else if (!showAll) {
    filteredQuery = filteredQuery.eq("status", "new");
  }
  if (minScore > 0) filteredQuery = filteredQuery.gte("ai_score", minScore);
  if (maxScore > 0) filteredQuery = filteredQuery.lte("ai_score", maxScore);

  const [hitsRes, kpiRes, runsRes, dpmaRes] = await Promise.all([
    filteredQuery,
    supabase.from("hits").select("ai_score, status, first_seen_at, domain"),
    supabase
      .from("scan_runs")
      .select("id, started_at, finished_at, region, triggered_by, queries_run, raw_results, new_hits, updated_hits, status")
      .order("started_at", { ascending: false })
      .limit(8),
    supabase
      .from("trademarks")
      .select("id, markenname, aktenzeichen, relevance_score, match_type, prioritaet, widerspruchsfrist_ende, status, created_at")
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  const rows = (hitsRes.data ?? []) as Hit[];
  const groups = groupHits(rows);
  const groupRows: HitGroupRow[] = groups.map((g) => ({
    key: g.key,
    title: resolveCompany(g.primary) ?? g.primary.domain,
    primaryId: g.primary.id,
    primaryDomain: g.primary.domain,
    maxScore: g.maxScore,
    status: g.primary.status,
    reasoning: g.primary.ai_reasoning,
    snippet: g.primary.snippet,
    lastSeen: g.primary.last_seen_at,
    totalCount: g.totalCount,
    relatedUrls: g.related.map((r) => r.url),
  }));

  const all = (kpiRes.data ?? []) as Array<{
    ai_score: number | null;
    status: HitStatus;
    first_seen_at: string;
    domain: string;
  }>;

  const total = all.length;
  const high = all.filter((h) => (h.ai_score ?? 0) >= 7).length;
  const medium = all.filter((h) => (h.ai_score ?? 0) >= 4 && (h.ai_score ?? 0) < 7).length;
  const low = all.filter((h) => (h.ai_score ?? 0) > 0 && (h.ai_score ?? 0) < 4).length;
  const uniqueDomains = new Set(all.map((h) => h.domain)).size;

  const allSeries = buildDailySeries(all.map((h) => h.first_seen_at));
  const highSeries = buildDailySeries(all.filter((h) => (h.ai_score ?? 0) >= 7).map((h) => h.first_seen_at));
  const mediumSeries = buildDailySeries(all.filter((h) => (h.ai_score ?? 0) >= 4 && (h.ai_score ?? 0) < 7).map((h) => h.first_seen_at));
  const lowSeries = buildDailySeries(all.filter((h) => (h.ai_score ?? 0) > 0 && (h.ai_score ?? 0) < 4).map((h) => h.first_seen_at));

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = all.filter((h) => new Date(h.first_seen_at).getTime() >= sevenDaysAgo).length;
  const newSeries = buildDailySeries(
    all.filter((h) => new Date(h.first_seen_at).getTime() >= sevenDaysAgo).map((h) => h.first_seen_at),
    7,
  );

  const runs = (runsRes.data ?? []) as ScanRun[];
  const lastRun = runs[0];

  return (
    <AppShell user={auth.user}>
      {/* KPI-Reihe */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Gesamt"
          value={total}
          href="/"
          trend={allSeries}
        />
        <KpiCard
          label="Verletzung hoch"
          value={high}
          href="/?minScore=7"
          tone="red"
          hint="Score 7–10"
          trend={highSeries}
        />
        <KpiCard
          label="Grenzwertig"
          value={medium}
          href="/?minScore=4&maxScore=6"
          tone="amber"
          hint="Score 4–6"
          trend={mediumSeries}
        />
        <KpiCard
          label="Kein Konflikt"
          value={low}
          href="/?minScore=1&maxScore=3"
          tone="emerald"
          hint="Score 1–3"
          trend={lowSeries}
        />
        <KpiCard
          label="Neu (7 Tage)"
          value={newThisWeek}
          tone="brand"
          trend={newSeries}
        />
        <KpiCard label="Unique Domains" value={uniqueDomains} tone="slate" />
      </section>

      {/* Scan-Control */}
      <section className="mt-6">
        <div className="glass flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Neue Suche starten</h2>
            <p className="mt-1 text-xs text-stone-600">
              Wähle Region und Bereich — verfolge den Scan live auf der Deutschlandkarte.
            </p>
            {lastRun && (
              <p className="mt-2 text-[11px] text-stone-500">
                Letzter Scan: {new Date(lastRun.started_at).toLocaleString("de-DE")} · Region{" "}
                <span className="font-medium">{lastRun.region ?? "—"}</span> · {lastRun.new_hits} neu
                · {lastRun.updated_hits} aktualisiert · Status{" "}
                <span className="font-medium">{lastRun.status}</span>
              </p>
            )}
          </div>
          <Link
            href="/scan"
            className="rounded-xl bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_6px_24px_rgba(68,64,60,0.25)] transition hover:bg-stone-800"
          >
            Live-Scan öffnen →
          </Link>
        </div>
      </section>

      {/* Filters */}
      <nav className="mt-8 flex flex-wrap gap-2 text-sm">
        <FilterLink
          label="Offen"
          href="/"
          active={!params.status && !params.minScore && !params.maxScore}
        />
        <FilterLink
          label="Für Anwalt"
          href="/?minScore=8"
          active={minScore === 8 && !maxScore}
        />
        <FilterLink label="Alle" href="/?status=all" active={showAll} />
        <FilterLink label="Verdacht (≥7)" href="/?minScore=7" active={minScore === 7 && !maxScore} />
        <FilterLink
          label="Mittel (4–6)"
          href="/?minScore=4&maxScore=6"
          active={minScore === 4 && maxScore === 6}
        />
        <FilterLink
          label="Niedrig (1–3)"
          href="/?minScore=1&maxScore=3"
          active={minScore === 1 && maxScore === 3}
        />
        {(Object.keys(STATUS_LABEL) as HitStatus[]).map((s) => (
          <FilterLink
            key={s}
            label={STATUS_LABEL[s]}
            href={`/?status=${s}`}
            active={params.status === s}
          />
        ))}
      </nav>

      {/* Hits table */}
      <HitsTable groups={groupRows} totalUrls={rows.length} />

      {/* DPMA-Register Treffer */}
      {(dpmaRes.data ?? []).length > 0 && (
        <section className="glass mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              DPMA-Register
              <span className="ml-2 text-stone-500">· Top {(dpmaRes.data ?? []).length}</span>
            </h2>
            <Link
              href="/trademarks"
              className="text-xs text-stone-500 hover:text-stone-800"
            >
              Alle anzeigen →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Score</th>
                  <th className="px-5 py-3 font-semibold">Marke</th>
                  <th className="px-5 py-3 font-semibold">Match</th>
                  <th className="px-5 py-3 font-semibold">Priorität</th>
                  <th className="px-5 py-3 font-semibold">Frist</th>
                </tr>
              </thead>
              <tbody>
                {(dpmaRes.data ?? []).map((t) => {
                  const days = t.widerspruchsfrist_ende
                    ? Math.ceil((new Date(t.widerspruchsfrist_ende).getTime() - Date.now()) / 86_400_000)
                    : null;
                  return (
                    <tr key={t.id} className="border-t border-white/50 transition hover:bg-white/50">
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                            (t.relevance_score ?? 0) >= 7
                              ? "bg-rose-100/80 text-rose-900"
                              : (t.relevance_score ?? 0) >= 4
                                ? "bg-amber-100/80 text-amber-900"
                                : "bg-stone-200/70 text-stone-700"
                          }`}
                        >
                          {t.relevance_score ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/trademarks/${t.id}`}
                          className="font-semibold text-stone-900 hover:text-stone-600"
                        >
                          {t.markenname}
                        </Link>
                        <div className="text-[11px] text-stone-500">{t.aktenzeichen}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-stone-700 ring-1 ring-white capitalize">
                          {t.match_type}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {t.prioritaet ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                              t.prioritaet === "critical"
                                ? "bg-rose-100 text-rose-900"
                                : t.prioritaet === "high"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {t.prioritaet}
                          </span>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs ${
                            days !== null && days <= 7
                              ? "font-bold text-rose-700"
                              : days !== null && days <= 30
                                ? "font-semibold text-amber-700"
                                : "text-stone-500"
                          }`}
                        >
                          {days !== null ? (days < 0 ? "Abgelaufen" : `${days}d`) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scan history */}
      <section className="glass mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Scan-Historie</h2>
          <div className="flex items-center gap-3">
            <Sparkline
              data={runs
                .slice()
                .reverse()
                .map((r) => r.new_hits)}
              color="#78716c"
              width={180}
              height={40}
            />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Neue Hits</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Start</th>
                <th className="px-5 py-3 font-semibold">Region</th>
                <th className="px-5 py-3 font-semibold">Trigger</th>
                <th className="px-5 py-3 font-semibold">Roh</th>
                <th className="px-5 py-3 font-semibold">Neu</th>
                <th className="px-5 py-3 font-semibold">Updates</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    Noch kein Scan gelaufen.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-white/50">
                  <td className="px-5 py-3 text-[11px] text-slate-700">
                    {new Date(r.started_at).toLocaleString("de-DE")}
                  </td>
                  <td className="px-5 py-3 text-[11px] capitalize">{r.region ?? "—"}</td>
                  <td className="px-5 py-3 text-[11px] text-slate-500">{r.triggered_by ?? "—"}</td>
                  <td className="px-5 py-3 text-[11px]">{r.raw_results}</td>
                  <td className="px-5 py-3 text-[11px] font-semibold text-emerald-700">
                    {r.new_hits}
                  </td>
                  <td className="px-5 py-3 text-[11px]">{r.updated_hits}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                        r.status === "success"
                          ? "bg-emerald-100/80 text-emerald-800"
                          : r.status === "partial"
                            ? "bg-amber-100/80 text-amber-800"
                            : r.status === "failed"
                              ? "bg-red-100/80 text-red-800"
                              : "bg-slate-100/80 text-slate-700"
                      }`}
                    >
                      {r.status}
                    </span>
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

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
        active
          ? "border-stone-300 bg-stone-900 text-white shadow-sm"
          : "border-white/70 bg-white/60 text-stone-600 backdrop-blur hover:bg-white/90"
      }`}
    >
      {label}
    </Link>
  );
}
