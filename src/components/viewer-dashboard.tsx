"use client";

import Link from "next/link";
import { useState } from "react";

interface ActionHit {
  id: string;
  title: string;
  domain: string;
  score: number | null;
  status: string;
  city: string | null;
  lastSeen: string;
  source: string;
  href: string;
}

interface ViewerStats {
  total: number;
  urgent: number;
  inReview: number;
  done: number;
  lastScan: string | null;
}

const SCORE_BG: Record<string, string> = {
  critical: "bg-rose-600 text-white",
  high: "bg-rose-100 text-rose-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-stone-200 text-stone-600",
};

const SOURCE_BADGE: Record<string, string> = {
  web: "bg-sky-100 text-sky-700",
  dpma: "bg-violet-100 text-violet-700",
  euipo: "bg-indigo-100 text-indigo-700",
  import: "bg-stone-100 text-stone-500",
  handelsregister: "bg-teal-100 text-teal-700",
};

function scoreLevel(s: number | null) {
  if (s === null) return "low";
  if (s >= 9) return "critical";
  if (s >= 7) return "high";
  if (s >= 5) return "medium";
  return "low";
}

function relDate(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return "heute";
  if (diff === 1) return "gestern";
  return `vor ${diff} Tagen`;
}

function HitCard({ hit }: { hit: ActionHit }) {
  const level = scoreLevel(hit.score);
  const sourceName = hit.source === "dpma" ? "DPMA" : hit.source === "euipo" ? "EUIPO" : hit.source === "import" ? "Import" : hit.source === "handelsregister" ? "HR" : "Web";

  return (
    <Link
      href={hit.href}
      className="block rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm transition active:scale-[0.98] hover:bg-white/90"
    >
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-lg font-black ${SCORE_BG[level]}`}>
          {hit.score ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight text-stone-900">{hit.title}</p>
          <p className="mt-0.5 truncate text-xs text-stone-400">{hit.domain}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SOURCE_BADGE[hit.source] ?? SOURCE_BADGE.web}`}>
              {sourceName}
            </span>
            {hit.city && <span className="text-[10px] text-stone-400">{hit.city}</span>}
            <span className="ml-auto text-[10px] text-stone-300">{relDate(hit.lastSeen)}</span>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0 text-stone-300">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}

function Section({ title, color, count, hits, emptyText }: {
  title: string;
  color: string;
  count: number;
  hits: ActionHit[];
  emptyText: string;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 ${color}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-stone-900">{title}</span>
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">{count}</span>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`shrink-0 text-stone-500 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {hits.length === 0
            ? <p className="px-4 py-5 text-center text-sm text-stone-400">{emptyText}</p>
            : hits.map((h) => <HitCard key={h.id} hit={h} />)
          }
        </div>
      )}
    </div>
  );
}

export function ViewerDashboard({
  urgent,
  inReview,
  stats,
}: {
  urgent: ActionHit[];
  inReview: ActionHit[];
  stats: ViewerStats;
}) {
  return (
    <div className="space-y-4 pb-8">
      {/* Header stats strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-stone-900">{stats.total}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Gesamt</div>
        </div>
        <div className="glass rounded-2xl p-3 text-center">
          <div className={`text-2xl font-black ${stats.urgent > 0 ? "text-rose-700" : "text-stone-900"}`}>{stats.urgent}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Dringend</div>
        </div>
        <div className="glass rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-emerald-700">{stats.done}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Erledigt</div>
        </div>
      </div>

      {/* Last scan info */}
      {stats.lastScan && (
        <div className="rounded-xl border border-white/60 bg-white/50 px-4 py-2 text-center text-xs text-stone-400">
          Letzter Scan: {new Date(stats.lastScan).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {/* Urgent hits */}
      <Section
        title="Dringend (Score ≥ 7)"
        color="bg-rose-50/80"
        count={urgent.length}
        hits={urgent}
        emptyText="Keine dringenden Treffer."
      />

      {/* In review hits */}
      <Section
        title="In Bearbeitung"
        color="bg-amber-50/80"
        count={inReview.length}
        hits={inReview}
        emptyText="Keine Treffer in Bearbeitung."
      />

      {/* Footer */}
      <div className="pt-2 text-center text-[10px] text-stone-300">
        Nur-Lese-Zugriff · Brand Monitor
      </div>
    </div>
  );
}
