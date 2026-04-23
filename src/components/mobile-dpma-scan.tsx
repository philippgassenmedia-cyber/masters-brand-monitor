"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface DpmaJob {
  id: string;
  created_at: string;
  picked_up_at: string | null;
  finished_at: string | null;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  stems: string[];
  created_by: string;
}

interface Trademark {
  id: string;
  markenname: string;
  aktenzeichen: string;
  relevance_score: number | null;
  match_type: string | null;
  prioritaet: string | null;
}

interface JobsData {
  jobs: DpmaJob[];
  agentOnline: boolean;
  recentTrademarks: Trademark[];
}

function statusLabel(status: DpmaJob["status"]) {
  switch (status) {
    case "pending": return { text: "Wartend", cls: "bg-amber-100 text-amber-800" };
    case "running": return { text: "Läuft…", cls: "bg-blue-100 text-blue-800" };
    case "done": return { text: "Fertig", cls: "bg-emerald-100 text-emerald-800" };
    case "failed": return { text: "Fehler", cls: "bg-rose-100 text-rose-800" };
    case "cancelled": return { text: "Abgebrochen", cls: "bg-stone-100 text-stone-500" };
  }
}

function scoreBg(score: number | null) {
  if (score === null) return "bg-stone-100 text-stone-500";
  if (score >= 7) return "bg-rose-100 text-rose-800";
  if (score >= 4) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

export function MobileDpmaScan() {
  const [data, setData] = useState<JobsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/dpma/jobs");
      if (res.ok) setData(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, []);

  const createJob = async () => {
    setSubmitting(true);
    setError(null);
    setSubmitted(false);
    try {
      const res = await fetch("/api/dpma/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Unbekannter Fehler");
      } else {
        setSubmitted(true);
        await fetchData();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const agentOnline = data?.agentOnline ?? false;
  const jobs = data?.jobs ?? [];
  const recentTrademarks = data?.recentTrademarks ?? [];

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-stone-900">Register-Suche</h1>
        <Link href="/trademarks" className="text-xs text-stone-500">← Register</Link>
      </div>

      {/* Agent status */}
      <section className="glass p-4">
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="h-3 w-3 rounded-full bg-stone-300 animate-pulse" />
          ) : agentOnline ? (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="h-3 w-3 rounded-full bg-stone-300" />
          )}
          <div>
            <div className="text-sm font-semibold text-stone-900">
              {loading ? "Verbinde…" : agentOnline ? "DPMA-Agent online" : "DPMA-Agent offline"}
            </div>
            <div className="text-[11px] text-stone-500">
              {agentOnline
                ? "Lokales Gerät empfängt Scan-Aufträge"
                : "Kein lokales Gerät aktiv — Scan kann trotzdem erstellt werden"}
            </div>
          </div>
        </div>

        {!agentOnline && !loading && (
          <div className="mt-2.5 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
            Starte auf deinem Desktop-Gerät: <code className="font-mono font-semibold">npm run dpma-agent</code>
          </div>
        )}
      </section>

      {/* Create job */}
      <section className="glass p-4">
        <p className="mb-3 text-xs text-stone-600">
          Der Scan-Auftrag wird an ein gemeldetes lokales Gerät übermittelt und dort ausgeführt.
          Markenstämme werden aus den{" "}
          <Link href="/settings/dpma" className="font-semibold text-stone-800 underline">Einstellungen</Link>{" "}
          geladen.
        </p>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-800">
            {error}
          </div>
        )}

        {submitted && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800">
            Auftrag erstellt. Der Agent nimmt ihn automatisch auf.
          </div>
        )}

        <button
          onClick={createJob}
          disabled={submitting}
          className="w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(28,25,23,0.25)] active:scale-[0.98] transition disabled:opacity-50"
        >
          {submitting ? "Wird erstellt…" : "Scan auf lokalem Gerät starten"}
        </button>
      </section>

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <section className="glass p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Letzte Aufträge
          </h2>
          <div className="space-y-2">
            {jobs.map((j) => {
              const s = statusLabel(j.status);
              return (
                <div
                  key={j.id}
                  className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2.5"
                >
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${s.cls}`}>
                    {s.text}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-stone-900">
                      {j.stems.slice(0, 3).join(", ")}{j.stems.length > 3 ? "…" : ""}
                    </div>
                    <div className="text-[11px] text-stone-400">{relTime(j.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent trademark hits */}
      {recentTrademarks.length > 0 && (
        <section className="glass p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Letzte Marken-Treffer · {recentTrademarks.length}
          </h2>
          <div className="space-y-2">
            {recentTrademarks.map((tm) => (
              <Link
                key={tm.id}
                href={`/trademarks/${tm.id}`}
                className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2.5 active:bg-white transition"
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${scoreBg(tm.relevance_score)}`}>
                  {tm.relevance_score ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-stone-900">{tm.markenname}</div>
                  <div className="truncate text-[11px] text-stone-400">{tm.aktenzeichen}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-300">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            ))}
          </div>
          <Link href="/trademarks" className="mt-3 block text-center text-xs text-stone-400 hover:text-stone-700">
            Alle Marken anzeigen →
          </Link>
        </section>
      )}

      {!loading && jobs.length === 0 && recentTrademarks.length === 0 && (
        <div className="rounded-2xl border border-stone-100 bg-stone-50/60 px-4 py-6 text-center text-xs text-stone-400">
          Noch keine Scan-Aufträge. Starte einen Scan oben.
        </div>
      )}
    </div>
  );
}
