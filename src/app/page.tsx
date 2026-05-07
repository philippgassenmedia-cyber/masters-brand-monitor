import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { Sparkline } from "@/components/sparkline";
import { groupHits, resolveCompany } from "@/lib/dedupe";
import { RunningBanner } from "@/components/running-banner";
import { EnrichHitsButton } from "@/components/enrich-hits-button";
import { AgentDownloadButton } from "@/components/agent-download-button";
import { ViewerDashboard } from "@/components/viewer-dashboard";
import { getUserRole } from "@/lib/auth/get-role";
import { KanbanBoard } from "@/components/kanban-board";
import type { KanbanCard } from "@/components/kanban-board";
import type { Hit, HitStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ScanRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  region: string | null;
  new_hits: number;
  updated_hits: number;
  raw_results: number;
  status: string;
}

function extractCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const plzCity = address.match(/\d{5}\s+([A-ZÄÖÜ][a-zäöüß][\wÄÖÜäöüß\s\-]{1,30})/);
  if (plzCity) return plzCity[1].split(/[,;]/)[0].trim();
  const afterComma = address.match(/,\s*([A-ZÄÖÜ][a-zäöüß][\wÄÖÜäöüß\s\-]{1,25})\s*(?:\d{5}|$)/);
  if (afterComma) return afterComma[1].trim();
  return null;
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
  searchParams: Promise<{ view?: string }>;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const role = await getUserRole();

  // ── Viewer mode: simplified mobile-first dashboard ───────────────────────
  if (role === "viewer") {
    const [hitsRes, runsRes, tmRes] = await Promise.all([
      supabase.from("hits").select("id, domain, title, company_name, address, subject_company_address, ai_score, status, last_seen_at, url, ai_model").order("ai_score", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("scan_runs").select("started_at").order("started_at", { ascending: false }).limit(1),
      supabase.from("trademarks").select("id, markenname, aktenzeichen, relevance_score, workflow_status, quelle, created_at").order("relevance_score", { ascending: false, nullsFirst: false }).limit(200),
    ]);
    const rawHits = (hitsRes.data ?? []) as Hit[];
    const groups = groupHits(rawHits);

    const toViewerCard = (g: ReturnType<typeof groupHits>[number]) => ({
      id: g.primary.id,
      title: resolveCompany(g.primary) ?? g.primary.domain,
      domain: g.primary.domain,
      score: g.maxScore,
      status: g.primary.status,
      city: extractCity(g.primary.address ?? g.primary.subject_company_address),
      lastSeen: g.primary.last_seen_at,
      source: (g.primary as Hit & { ai_model?: string | null }).ai_model === "imported" ? "import" : "web",
      href: `/hits/${g.primary.id}`,
    });

    const urgent = groups.filter((g) => (g.maxScore ?? 0) >= 7 && g.primary.status === "new").map(toViewerCard);
    const inReview = groups.filter((g) => g.primary.status === "reviewing").map(toViewerCard);
    const allHits = groups;
    const done = allHits.filter((g) => ["confirmed","dismissed","sent_to_lawyer","resolved"].includes(g.primary.status)).length;
    const tmUrgent = (tmRes.data ?? []).filter((t) => (t.relevance_score ?? 0) >= 7 && (!t.workflow_status || t.workflow_status === "new"))
      .map((t) => ({
        id: t.id,
        title: t.markenname,
        domain: t.aktenzeichen,
        score: t.relevance_score,
        status: t.workflow_status ?? "new",
        city: null,
        lastSeen: t.created_at,
        source: (t.quelle ?? "dpma").toLowerCase().includes("euipo") ? "euipo" : "dpma",
        href: `/trademarks/${t.id}`,
      }));

    return (
      <AppShell user={auth.user} role={role}>
        <ViewerDashboard
          urgent={[...urgent, ...tmUrgent].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))}
          inReview={inReview}
          stats={{
            total: allHits.length + (tmRes.data ?? []).length,
            urgent: urgent.length + tmUrgent.length,
            inReview: inReview.length,
            done,
            lastScan: runsRes.data?.[0]?.started_at ?? null,
          }}
        />
      </AppShell>
    );
  }

  const params = await searchParams;
  const fullView = params.view === "all";

  const [hitsRes, kpiRes, runsRes, tmRes] = await Promise.all([
    supabase
      .from("hits")
      .select("id, domain, title, snippet, ai_score, status, company_name, address, subject_company_address, ai_reasoning, first_seen_at, last_seen_at, url, ai_model")
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("first_seen_at", { ascending: false })
      .limit(1000),
    supabase.from("hits").select("ai_score, status, first_seen_at, domain"),
    supabase
      .from("scan_runs")
      .select("id, started_at, finished_at, region, new_hits, updated_hits, raw_results, status")
      .order("started_at", { ascending: false })
      .limit(8),
    supabase
      .from("trademarks")
      .select("id, markenname, aktenzeichen, relevance_score, workflow_status, quelle, prioritaet, widerspruchsfrist_ende, created_at")
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(1000),
  ]);

  // ── Build unified kanban cards ────────────────────────────────────────────

  // Web / import hits
  const rawHits = (hitsRes.data ?? []) as (Hit & { ai_model?: string | null })[];
  const groups = groupHits(rawHits);

  const hitCards: KanbanCard[] = groups.map((g) => ({
    id: g.primary.id,
    title: resolveCompany(g.primary) ?? g.primary.domain,
    sub: g.primary.domain,
    score: g.maxScore,
    status: g.primary.status,
    city: extractCity(g.primary.address ?? g.primary.subject_company_address),
    lastSeen: g.primary.last_seen_at,
    totalCount: g.totalCount,
    source: (g.primary as Hit & { ai_model?: string | null }).ai_model === "imported" ? "import" : "web",
    href: `/hits/${g.primary.id}`,
    type: "hit" as const,
  }));

  // DPMA / EUIPO trademarks
  const tmCards: KanbanCard[] = (tmRes.data ?? []).map((t) => ({
    id: t.id,
    title: t.markenname,
    sub: t.aktenzeichen,
    score: t.relevance_score ?? null,
    status: (t.workflow_status ?? "new") as HitStatus,
    city: null,
    lastSeen: t.created_at,
    totalCount: 1,
    source: (t.quelle ?? "dpma").toLowerCase().includes("euipo") ? "euipo" : "dpma",
    href: `/trademarks/${t.id}`,
    type: "trademark" as const,
  }));

  // Merge and sort by score
  const allCards = [...hitCards, ...tmCards].sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1),
  );

  // Default view: hide score < 5
  const visibleCards = fullView ? allCards : allCards.filter((c) => (c.score ?? 0) >= 5);

  const openCards = visibleCards.filter((c) => c.status === "new");
  const reviewCards = visibleCards.filter((c) => c.status === "reviewing");
  const doneCards = visibleCards.filter((c) =>
    ["confirmed", "dismissed", "sent_to_lawyer", "resolved"].includes(c.status),
  );

  // Total counts (always from full set for KPIs)
  const allOpen = allCards.filter((c) => c.status === "new").length;
  const allReview = allCards.filter((c) => c.status === "reviewing").length;
  const allDone = allCards.filter((c) =>
    ["confirmed", "dismissed", "sent_to_lawyer", "resolved"].includes(c.status),
  ).length;

  // KPI from hits table
  const kpiHits = (kpiRes.data ?? []) as Array<{ ai_score: number | null; status: HitStatus; first_seen_at: string; domain: string }>;
  const total = kpiHits.length + (tmRes.data ?? []).length;
  const high = [...kpiHits, ...(tmRes.data ?? []).map((t) => ({ ai_score: t.relevance_score, status: t.workflow_status as HitStatus, first_seen_at: t.created_at, domain: "" }))]
    .filter((h) => (h.ai_score ?? 0) >= 7).length;
  const allTs = [...kpiHits.map((h) => h.first_seen_at), ...(tmRes.data ?? []).map((t) => t.created_at)];
  const allSeries = buildDailySeries(allTs);
  const highSeries = buildDailySeries([...kpiHits.filter((h) => (h.ai_score ?? 0) >= 7).map((h) => h.first_seen_at)]);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = allTs.filter((t) => new Date(t).getTime() >= sevenDaysAgo).length;
  const newSeries = buildDailySeries(allTs.filter((t) => new Date(t).getTime() >= sevenDaysAgo), 7);

  const runs = (runsRes.data ?? []) as ScanRun[];
  const lastRun = runs[0];

  // Only show banner if scan started within the last 2 hours (guards against stuck DB records)
  const scanIsActive =
    lastRun?.status === "running" &&
    Date.now() - new Date(lastRun.started_at).getTime() < 2 * 60 * 60 * 1000;

  return (
    <AppShell user={auth.user} role={role}>
      {scanIsActive && (
        <RunningBanner newHits={lastRun.new_hits} startedAt={lastRun.started_at} region={lastRun.region ?? null} />
      )}

      {/* KPI */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Gesamt" value={total} href="/hits" trend={allSeries} />
        <KpiCard label="Offen" value={allOpen} tone="brand" />
        <KpiCard label="In Bearbeitung" value={allReview} tone="amber" />
        <KpiCard label="Erledigt" value={allDone} tone="emerald" />
        <KpiCard label="Hoch (≥7)" value={high} tone="red" trend={highSeries} hint="Score 7–10" />
        <KpiCard label="Neu (7 Tage)" value={newThisWeek} tone="slate" trend={newSeries} />
      </section>

      {/* Scan-Control */}
      <section className="mt-4">
        <div className="glass flex flex-wrap items-center justify-between gap-4 p-3 md:p-4">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Neue Suche starten</h2>
            {lastRun && (
              <p className="mt-1 text-[11px] text-stone-500">
                Letzter Scan: {new Date(lastRun.started_at).toLocaleString("de-DE")} · {lastRun.new_hits} neue Treffer
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <EnrichHitsButton />
            <AgentDownloadButton />
            <Link href="/scan" className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800">
              Live-Scan →
            </Link>
          </div>
        </div>
      </section>

      {/* Kanban header */}
      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-stone-700">
            {fullView ? "Alle Treffer" : "Treffer (Score ≥ 5)"}
          </h2>
          {/* Source legend */}
          <div className="flex items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold bg-sky-100 text-sky-700">Web</span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold bg-violet-100 text-violet-700">DPMA</span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold bg-indigo-100 text-indigo-700">EUIPO</span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold bg-stone-100 text-stone-500">Import</span>
          </div>
        </div>
        {fullView ? (
          <Link href="/" className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:text-stone-800">
            ← Kompaktansicht
          </Link>
        ) : (
          <Link href="/?view=all" className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:text-stone-800">
            Alle anzeigen (inkl. Score &lt; 5)
          </Link>
        )}
      </div>

      {/* Kanban-Board */}
      <section className="mt-2">
        <KanbanBoard
          initialOpen={openCards}
          initialReview={reviewCards}
          initialDone={doneCards}
          fullView={fullView}
        />
      </section>

      {/* Scan-Historie (nur in Kompaktansicht) */}
      {!fullView && (
        <section className="glass mt-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Scan-Historie</h2>
            <Sparkline
              data={runs.slice().reverse().map((r) => r.new_hits)}
              color="#78716c"
              width={140}
              height={32}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Start</th>
                  <th className="px-5 py-3 font-semibold hidden md:table-cell">Region</th>
                  <th className="px-5 py-3 font-semibold hidden md:table-cell">Roh</th>
                  <th className="px-5 py-3 font-semibold">Neu</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">Noch kein Scan gelaufen.</td></tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-white/50">
                    <td className="px-5 py-3 text-[11px] text-slate-700">{new Date(r.started_at).toLocaleString("de-DE")}</td>
                    <td className="px-5 py-3 text-[11px] capitalize hidden md:table-cell">{r.region ?? "—"}</td>
                    <td className="px-5 py-3 text-[11px] hidden md:table-cell">{r.raw_results}</td>
                    <td className="px-5 py-3 text-[11px] font-semibold text-emerald-700">{r.new_hits}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${r.status === "success" ? "bg-emerald-100/80 text-emerald-800" : r.status === "partial" ? "bg-amber-100/80 text-amber-800" : r.status === "failed" ? "bg-red-100/80 text-red-800" : "bg-slate-100/80 text-slate-700"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
