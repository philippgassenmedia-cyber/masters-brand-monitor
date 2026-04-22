"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KpiCard } from "@/components/kpi-card";
import { TrademarkExcludeButton } from "@/components/trademark-exclude-button";
import type { Trademark } from "@/lib/dpma/types";

const MATCH_LABEL: Record<string, string> = {
  exact: "Exakt",
  compound: "Wortverbindung",
  fuzzy: "Ähnlich",
  phonetic: "Phonetisch",
  class_only: "Nur Klasse",
};

const PRIO_STYLE: Record<string, string> = {
  critical: "bg-rose-100 text-rose-900",
  high: "bg-amber-100 text-amber-900",
  medium: "bg-stone-200/80 text-stone-800",
  low: "bg-stone-100 text-stone-600",
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function fristBadge(days: number | null) {
  if (days === null) return { cls: "text-stone-400", text: "—" };
  if (days < 0) return { cls: "text-stone-400 line-through", text: "Abgelaufen" };
  if (days <= 7) return { cls: "text-rose-700 font-bold", text: `${days}d` };
  if (days <= 30) return { cls: "text-amber-700 font-semibold", text: `${days}d` };
  return { cls: "text-stone-700", text: `${days}d` };
}

const INITIAL_VISIBLE = 5;

export function TrademarksClient({
  trademarks,
  kpis,
  filters,
}: {
  trademarks: Trademark[];
  kpis: {
    total: number;
    exact: number;
    compound: number;
    fuzzy: number;
    critical: number;
    fristSoon: number;
  };
  filters: { matchType?: string; priority?: string; minScore?: string };
}) {
  const [showAll, setShowAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const router = useRouter();
  const visible = showAll ? trademarks : trademarks.slice(0, INITIAL_VISIBLE);
  const hasMore = trademarks.length > INITIAL_VISIBLE;

  const triggerDpmaScan = () => {
    setScanMsg(null);
    startTransition(async () => {
      try {
        // Scheduled Scan erstellen + sofort triggern
        await fetch("/api/scheduled-scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduled_at: new Date().toISOString(),
            scan_type: "dpma",
            notes: "Manuell gestartet",
          }),
        });
        const scanData = await fetch("/api/scheduled-scans").then(r => r.json());
        const pendingScan = (scanData.scans ?? []).find((s: { status: string }) => s.status === "pending");
        if (pendingScan) {
          await fetch("/api/scheduled-scans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trigger_id: pendingScan.id }),
          });
        }
        setScanMsg("DPMA-Scan gestartet. Der lokale Agent nimmt den Auftrag auf. Ergebnisse erscheinen hier automatisch.");
      } catch (e) {
        setScanMsg(`Fehler: ${(e as Error).message}`);
      }
      router.refresh();
    });
  };


  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">DPMA-Register</h1>
          <p className="mt-1 text-sm text-stone-600">
            Markenanmeldungen aus dem DPMAkurier mit Matching, Scoring und Fristen-Tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/trademarks/scan"
            className="flex h-10 items-center rounded-full bg-stone-900 px-5 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800"
          >
            Register-Suche (DPMA + EUIPO) →
          </Link>
          <button
            onClick={triggerDpmaScan}
            disabled={pending}
            className="h-10 rounded-full border border-white/80 bg-white/60 px-5 text-xs font-semibold text-stone-700 hover:bg-white/90 disabled:opacity-60"
          >
            {pending ? "Wird gestartet…" : "DPMA Scan starten"}
          </button>
          <Link
            href="/settings/dpma"
            className="flex h-10 items-center rounded-full border border-white/80 bg-white/60 px-5 text-xs font-semibold text-stone-700 hover:bg-white/90"
          >
            Einstellungen
          </Link>
        </div>
      </header>
      {scanMsg && (
        <div className={`mb-4 rounded-2xl px-4 py-2 text-sm ${
          scanMsg.startsWith("Fehler")
            ? "border border-rose-200 bg-rose-50/80 text-rose-800"
            : "border border-emerald-200 bg-emerald-50/80 text-emerald-800"
        }`}>
          {scanMsg}
        </div>
      )}

      {/* KPIs */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Gesamt" value={kpis.total} />
        <KpiCard label="Exakt" value={kpis.exact} tone="red" href="/trademarks?matchType=exact" />
        <KpiCard label="Wortverbindung" value={kpis.compound} tone="amber" href="/trademarks?matchType=compound" />
        <KpiCard label="Ähnlich / Phonetisch" value={kpis.fuzzy} tone="emerald" href="/trademarks?matchType=fuzzy" />
        <KpiCard label="Kritisch / Hoch" value={kpis.critical} tone="red" href="/trademarks?priority=critical" />
        <KpiCard
          label="Frist < 30 Tage"
          value={kpis.fristSoon}
          tone="brand"
          hint="Widerspruchsfrist läuft bald ab"
        />
      </section>

      {/* Filters */}
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Chip label="Offen" href="/trademarks" active={!filters.matchType && !filters.priority && !filters.minScore} />
        <Chip label="Alle" href="/trademarks?matchType=all" active={filters.matchType === "all"} />
        <Chip label="Exakt" href="/trademarks?matchType=exact" active={filters.matchType === "exact"} />
        <Chip label="Compound" href="/trademarks?matchType=compound" active={filters.matchType === "compound"} />
        <Chip label="Fuzzy" href="/trademarks?matchType=fuzzy" active={filters.matchType === "fuzzy"} />
        <Chip label="Nur Klasse" href="/trademarks?matchType=class_only" active={filters.matchType === "class_only"} />
        <Chip label="Kritisch" href="/trademarks?priority=critical" active={filters.priority === "critical"} />
        <Chip label="Score ≥ 7" href="/trademarks?minScore=7" active={filters.minScore === "7"} />
      </nav>

      {/* Table */}
      <section className="glass overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">
            Markentreffer
            <span className="ml-2 text-stone-500">· {trademarks.length}</span>
          </h2>
          <Link
            href="/settings/dpma"
            className="text-xs text-stone-500 hover:text-stone-800"
          >
            DPMA-Einstellungen →
          </Link>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Score</th>
                <th className="px-5 py-3 font-semibold">Marke</th>
                <th className="px-5 py-3 font-semibold">Anmelder</th>
                <th className="px-5 py-3 font-semibold">Match</th>
                <th className="px-5 py-3 font-semibold">Priorität</th>
                <th className="px-5 py-3 font-semibold">Frist</th>
                <th className="px-5 py-3 font-semibold">Klassen</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {trademarks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-stone-500">
                    Keine Markentreffer. Richte den DPMAkurier unter Einstellungen ein.
                  </td>
                </tr>
              )}
              {visible.map((t, idx) => {
                const days = daysUntil(t.widerspruchsfrist_ende);
                const frist = fristBadge(days);
                const isLast = !showAll && hasMore && idx === visible.length - 1;
                return (
                  <tr
                    key={t.id}
                    className={`border-t border-white/50 transition hover:bg-white/50 ${isLast ? "fade-row" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
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
                    <td className="max-w-[200px] px-5 py-3 text-[13px] text-stone-700">
                      <div className="truncate">{t.anmelder ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-medium text-stone-700 ring-1 ring-white">
                        {MATCH_LABEL[t.match_type ?? ""] ?? t.match_type ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {t.prioritaet ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${PRIO_STYLE[t.prioritaet] ?? ""}`}
                        >
                          {t.prioritaet}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs ${frist.cls}`}>{frist.text}</span>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-stone-600">
                      {t.nizza_klassen?.join(", ") ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <TrademarkExcludeButton trademarkId={t.id} markenname={t.markenname} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!showAll && hasMore && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white/90 via-white/60 to-transparent" />
          )}
        </div>
        {hasMore && (
          <div className="relative flex justify-center border-t border-white/60 px-5 py-3">
            <button
              onClick={() => setShowAll(!showAll)}
              className="rounded-full bg-stone-900 px-6 py-2 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800"
            >
              {showAll ? "Weniger anzeigen" : `Alle ${trademarks.length} anzeigen`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
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
