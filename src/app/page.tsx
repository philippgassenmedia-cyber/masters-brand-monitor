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

function scoreBg(score: number | null) {
  if (score === null) return "bg-stone-200/70 text-stone-600";
  if (score >= 7) return "bg-rose-100 text-rose-800";
  if (score >= 4) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

const STATUS_CHIP: Record<HitStatus, string> = {
  new: "bg-stone-100 text-stone-600",
  reviewing: "bg-amber-100 text-amber-700",
  confirmed: "bg-rose-100 text-rose-700",
  dismissed: "bg-emerald-100 text-emerald-700",
  sent_to_lawyer: "bg-purple-100 text-purple-700",
  resolved: "bg-sky-100 text-sky-700",
};

const STATUS_LABEL: Record<HitStatus, string> = {
  new: "Offen",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

const SOURCE_BADGE: Record<string, string> = {
  web: "bg-sky-100 text-sky-700",
  dpma: "bg-violet-100 text-violet-700",
  euipo: "bg-indigo-100 text-indigo-700",
  import: "bg-stone-100 text-stone-500",
};

interface KanbanCard {
  id: string;
  title: string;
  sub: string;        // domain for web, aktenzeichen for trademarks
  score: number | null;
  status: HitStatus;
  city: string | null;
  lastSeen: string;
  totalCount: number;
  source: string;     // "web" | "dpma" | "euipo" | "import"
  href: string;
}

function KanbanCardItem({ card }: { card: KanbanCard }) {
  const sourceLabel = card.source === "dpma" ? "DPMA" : card.source === "euipo" ? "EUIPO" : card.source === "import" ? "Import" : "Web";
  return (
    <Link
      href={card.href}
      className="flex items-start gap-3 rounded-xl border border-white/60 bg-white/50 p-3 transition hover:bg-white/80 hover:shadow-sm"
    >
      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${scoreBg(card.score)}`}>
        {card.score ?? "—"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-stone-900">
            {card.title}
          </p>
          {card.totalCount > 1 && (
            <span className="ml-1 mt-0.5 shrink-0 rounded-full bg-stone-800/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              +{card.totalCount - 1}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-stone-400">{card.sub}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${SOURCE_BADGE[card.source] ?? SOURCE_BADGE.web}`}>
            {sourceLabel}
          </span>
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_CHIP[card.status]}`}>
            {STATUS_LABEL[card.status]}
          </span>
          {card.city && <span className="text-[10px] text-stone-400">{card.city}</span>}
          <span className="ml-auto text-[10px] text-stone-300">
            {new Date(card.lastSeen).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
          </span>
        </div>
      </div>
    </Link>
  );
}

function KanbanColumn({
  title,
  color,
  cards,
  total,
  fullView,
  emptyText,
}: {
  title: string;
  color: string;
  cards: KanbanCard[];
  total: number;
  fullView: boolean;
  emptyText: string;
}) {
  // Default: max 15 cards; full view: all
  const shown = fullView ? cards : cards.slice(0, 15);
  const hidden = total - shown.length;

  return (
    <div className="glass flex min-h-[200px] flex-col rounded-2xl overflow-hidden">
      <div className={`flex items-center justify-between border-b border-white/60 px-4 py-3 ${color}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">{total}</span>
        </div>
        {!fullView && total > 0 && (
          <Link href="/?view=all" className="text-[10px] font-medium text-stone-500 hover:text-stone-800">
            Alle →
          </Link>
        )}
      </div>
      <div className={`flex-1 space-y-2 overflow-y-auto p-3 ${fullView ? "max-h-[70vh]" : ""}`}>
        {shown.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-stone-400">{emptyText}</p>
        )}
        {shown.map((c) => <KanbanCardItem key={`${c.source}-${c.id}`} card={c} />)}
        {!fullView && hidden > 0 && (
          <Link
            href="/?view=all"
            className="block rounded-xl border border-dashed border-stone-200 py-2 text-center text-xs text-stone-400 hover:border-stone-400 hover:text-stone-600"
          >
            + {hidden} weitere
          </Link>
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

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

  return (
    <AppShell user={auth.user}>
      {lastRun?.status === "running" && (
        <RunningBanner newHits={lastRun.new_hits} startedAt={lastRun.started_at} region={lastRun.region ?? null} />
      )}

      {/* KPI */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
            {(["web", "dpma", "euipo", "import"] as const).map((s) => (
              <span key={s} className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${SOURCE_BADGE[s]}`}>
                {s === "web" ? "Web" : s === "dpma" ? "DPMA" : s === "euipo" ? "EUIPO" : "Import"}
              </span>
            ))}
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
      <section className="mt-2 grid gap-4 lg:grid-cols-3">
        <KanbanColumn
          title="Offen"
          color="bg-stone-50/60"
          cards={openCards}
          total={openCards.length}
          fullView={fullView}
          emptyText="Keine offenen Treffer."
        />
        <KanbanColumn
          title="In Bearbeitung"
          color="bg-amber-50/60"
          cards={reviewCards}
          total={reviewCards.length}
          fullView={fullView}
          emptyText="Keine Treffer in Bearbeitung."
        />
        <KanbanColumn
          title="Bearbeitet"
          color="bg-emerald-50/40"
          cards={doneCards}
          total={doneCards.length}
          fullView={fullView}
          emptyText="Noch keine abgeschlossenen Treffer."
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
