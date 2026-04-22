"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { NIZZA_BESCHREIBUNG, IMMOBILIEN_KLASSEN } from "@/lib/dpma/nizza-klassen";
import { useScan } from "@/components/scan-context";

interface NewHit {
  id?: string;
  aktenzeichen: string;
  markenname: string;
  score: number | null;
  website?: string | null;
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${(sec % 60).toString().padStart(2, "0")}s`;
}

const DEFAULT_KLASSEN = new Set([36, 37, 42]);
type ScanSource = "dpma" | "euipo" | "both";

export function DpmaScanClient() {
  const { state, startScan, stopScan } = useScan();

  // Local UI state only — filter inputs + UI toggles
  const [source, setSource] = useState<ScanSource>("dpma");
  const [nurDE, setNurDE] = useState(true);
  const [nurInKraft, setNurInKraft] = useState(true);
  const [selectedKlassen, setSelectedKlassen] = useState<Set<number>>(DEFAULT_KLASSEN);
  const [zeitraumMonate, setZeitraumMonate] = useState(0);
  const [klassenOpen, setKlassenOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showSuccess, setShowSuccess] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const prevPhaseRef = useRef<string>(state.phase);

  const toggleKlasse = useCallback((k: number) => {
    setSelectedKlassen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const klassenString = [...selectedKlassen].sort((a, b) => a - b).join(" ");

  // Timer tick
  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.running]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.log]);

  // Success overlay when scan finishes while on this page
  useEffect(() => {
    const isDpmaSource = state.source === "dpma" || state.source === "euipo";
    if (!isDpmaSource) return;
    if (prevPhaseRef.current !== "done" && state.phase === "done") {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.source]);

  const start = () => {
    const endpoints =
      source === "both"
        ? ["/api/dpma/search/stream", "/api/euipo/search/stream"]
        : source === "euipo"
          ? ["/api/euipo/search/stream"]
          : ["/api/dpma/search/stream"];
    const contextSource = source === "euipo" ? "euipo" : "dpma";
    startScan(endpoints, { nurDE, nurInKraft, klassen: klassenString, zeitraumMonate }, contextSource);
  };

  // Derived state — only relevant when this source type is active
  const isDpmaScan = state.source === "dpma" || state.source === "euipo";
  const running = state.running && isDpmaScan;
  const phase = isDpmaScan ? state.phase : "idle";
  const log = isDpmaScan ? state.log : [];
  const progress = isDpmaScan ? state.progress : { current: 0, total: 0 };
  const startedAt = isDpmaScan ? state.startedAt : null;
  const kpis = {
    found: isDpmaScan ? state.progress.total : 0,
    newHits: isDpmaScan ? state.newHits : 0,
    updated: isDpmaScan ? state.updatedCount : 0,
    errors: isDpmaScan ? state.errors : 0,
  };
  const newHits: NewHit[] = isDpmaScan
    ? state.rawHits.map((h: Record<string, unknown>) => ({
        id: String(h.id ?? ""),
        aktenzeichen: String(h.aktenzeichen ?? ""),
        markenname: String(h.markenname ?? ""),
        score: (h.score as number | null) ?? null,
        website: (h.website as string | null) ?? null,
      }))
    : [];

  const elapsed = startedAt ? now - startedAt : 0;
  const pct = progress.total > 0 ? progress.current / progress.total : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Register Live-Suche</h1>
        <Link href="/trademarks" className="text-xs text-stone-500 hover:text-stone-800">
          ← Register-Übersicht
        </Link>
      </header>

      {/* Filter — hide while a register scan is active */}
      {!isDpmaScan || phase === "idle" ? (
        <section className="glass mb-3 p-5">
          <h2 className="mb-3 text-sm font-semibold text-stone-900">Suchfilter</h2>

          {/* Register-Auswahl */}
          <div className="mb-4">
            <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">Register</div>
            <div className="inline-flex rounded-full border border-white/80 bg-orange-50/70 p-1 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md">
              {([
                { value: "dpma" as ScanSource, label: "DPMA (DE)" },
                { value: "euipo" as ScanSource, label: "EUIPO (EU)" },
                { value: "both" as ScanSource, label: "Beide" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSource(opt.value)}
                  className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
                    source === opt.value
                      ? "bg-stone-900 text-white shadow"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Nizza-Klassen Dropdown */}
              <div className="relative sm:col-span-2">
                <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-stone-500">
                  Nizza-Klassen ({selectedKlassen.size} ausgewählt)
                </div>
                <button
                  type="button"
                  onClick={() => setKlassenOpen(!klassenOpen)}
                  className="flex h-10 w-full items-center justify-between rounded-full border border-white/80 bg-orange-50/70 px-4 text-left text-sm text-stone-800 outline-none transition hover:bg-white/80"
                >
                  <span className="truncate">
                    {selectedKlassen.size === 0
                      ? "Keine Klassen ausgewählt"
                      : [...selectedKlassen].sort((a, b) => a - b).map((k) => `${k}`).join(", ")}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 text-stone-400 transition ${klassenOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {klassenOpen && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-white/80 bg-white/95 p-2 shadow-[0_8px_32px_rgba(120,90,60,0.15)] backdrop-blur-xl">
                    <div className="mb-2 flex gap-2 px-2">
                      <button type="button" onClick={() => setSelectedKlassen(new Set([35, 36, 37, 42]))} className="rounded-full bg-stone-900 px-3 py-1 text-[10px] font-semibold text-white">
                        Immobilien-Klassen
                      </button>
                      <button type="button" onClick={() => setSelectedKlassen(new Set())} className="rounded-full border border-stone-300 px-3 py-1 text-[10px] font-medium text-stone-600">
                        Keine
                      </button>
                      <button type="button" onClick={() => setSelectedKlassen(new Set(Object.keys(NIZZA_BESCHREIBUNG).map(Number)))} className="rounded-full border border-stone-300 px-3 py-1 text-[10px] font-medium text-stone-600">
                        Alle
                      </button>
                    </div>
                    {Object.entries(NIZZA_BESCHREIBUNG).map(([k, desc]) => {
                      const num = Number(k);
                      const checked = selectedKlassen.has(num);
                      const isImmo = IMMOBILIEN_KLASSEN.has(num);
                      return (
                        <label
                          key={k}
                          className={`flex cursor-pointer items-start gap-2 rounded-xl px-2 py-1.5 transition hover:bg-stone-100/80 ${checked ? "bg-stone-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleKlasse(num)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-semibold ${checked ? "text-stone-900" : "text-stone-600"}`}>
                                Klasse {k}
                              </span>
                              {isImmo && (
                                <span className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900">
                                  Immobilien
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-500">{desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Zeitraum */}
              <div>
                <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-stone-500">Zeitraum</div>
                <select
                  value={zeitraumMonate}
                  onChange={(e) => setZeitraumMonate(Number(e.target.value))}
                  className="h-10 w-full appearance-none rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 outline-none"
                >
                  <option value={1}>Letzte 4 Wochen</option>
                  <option value={3}>Letzte 3 Monate</option>
                  <option value={6}>Letzte 6 Monate</option>
                  <option value={12}>Letztes Jahr</option>
                  <option value={0}>Kein Zeitfilter</option>
                </select>
              </div>

              {/* Checkboxen */}
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input type="checkbox" checked={nurDE} onChange={(e) => setNurDE(e.target.checked)} className="h-4 w-4 rounded" />
                  Nur deutsche Marken
                </label>
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input type="checkbox" checked={nurInKraft} onChange={(e) => setNurInKraft(e.target.checked)} className="h-4 w-4 rounded" />
                  Nur in Kraft befindliche
                </label>
              </div>
            </div>

            {/* Info-Box */}
            <div className="flex items-end">
              <div className="rounded-xl border border-white/70 bg-white/50 px-3 py-2 text-[11px] text-stone-600">
                Wort- &amp; Bildmarken werden beide durchsucht.<br />
                Markenstämme aus den{" "}
                <Link href="/settings/dpma" className="font-semibold text-stone-800 underline">
                  Einstellungen
                </Link>.
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Start / Status */}
      <section className="glass mb-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {running ? (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
            ) : phase === "done" ? (
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
            ) : (
              <span className="h-3 w-3 rounded-full bg-stone-400" />
            )}
            <div>
              <div className="text-sm font-semibold text-stone-900">
                {phase === "idle" ? "Bereit" : phase === "browser" ? "Register werden durchsucht" : phase === "analyze" ? "Treffer werden analysiert" : phase === "done" ? "Suche abgeschlossen" : "Verbinde…"}
              </div>
              <div className="text-[11px] text-stone-500">
                {running ? `Verstrichen: ${formatDuration(elapsed)}` : phase === "done" ? `Dauer: ${formatDuration(elapsed)}` : "Durchsucht das DPMA-Markenregister nach konfigurierten Markenstämmen"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isDpmaScan && progress.total > 0 && (
              <div className="flex items-center gap-3 text-right">
                <MiniStat label="Gefunden" value={kpis.found} />
                <MiniStat label="Neu" value={kpis.newHits} tone="emerald" />
                <MiniStat label="Bekannt" value={kpis.updated} />
                {kpis.errors > 0 && <MiniStat label="Fehler" value={kpis.errors} tone="red" />}
              </div>
            )}
            {!running ? (
              <button
                onClick={start}
                className="h-10 rounded-full bg-stone-900 px-6 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800"
              >
                {source === "dpma" ? "DPMA durchsuchen" : source === "euipo" ? "EUIPO durchsuchen" : "DPMA + EUIPO durchsuchen"}
              </button>
            ) : (
              <button
                onClick={stopScan}
                className="h-10 rounded-full border border-rose-200 bg-rose-50/80 px-6 text-xs font-semibold text-rose-800 hover:bg-rose-100"
              >
                Abbrechen
              </button>
            )}
          </div>
        </div>
        {isDpmaScan && (running || phase === "done") && progress.total > 0 && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-200/70">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                phase === "done" ? "bg-emerald-500" : "bg-gradient-to-r from-stone-700 to-stone-900"
              }`}
              style={{ width: `${Math.max(2, pct * 100)}%` }}
            />
          </div>
        )}
      </section>

      {/* Success Overlay */}
      {showSuccess && (
        <div className="success-overlay absolute inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-sm" onClick={() => setShowSuccess(false)}>
          <div className="success-card glass-strong flex min-w-[320px] flex-col items-center gap-3 px-10 py-8">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-200">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
            </div>
            <div className="text-lg font-semibold text-stone-900">Register-Suche abgeschlossen</div>
            <div className="text-sm text-stone-600">
              {kpis.newHits} neue Marken · {kpis.updated} bekannt · {formatDuration(elapsed)}
            </div>
            <Link href="/trademarks" className="mt-2 rounded-full bg-stone-900 px-5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800">
              Ergebnisse ansehen
            </Link>
          </div>
        </div>
      )}

      {/* Log + Results */}
      {isDpmaScan && (running || log.length > 0) && (
        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Log */}
          <div className="glass flex min-h-0 flex-col p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">Live-Log</h2>
            <div className="scroll-area min-h-0 flex-1 overflow-y-auto rounded-xl bg-stone-950 p-3 font-mono text-[11px] text-stone-200">
              {log.map((l, i) => (
                <div key={i} className={l.tone === "err" ? "text-rose-300" : l.tone === "warn" ? "text-amber-300" : l.tone === "ok" ? "text-emerald-300" : "text-stone-200"}>
                  <span className="mr-2 text-stone-500">{new Date(l.ts).toLocaleTimeString("de-DE")}</span>
                  {l.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Neue Treffer */}
          <div className="glass flex min-h-0 flex-col p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
              Neue Marken · {newHits.length}
            </h2>
            <div className="scroll-area min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {newHits.length === 0 && !running && (
                <div className="flex h-full items-center justify-center text-xs text-stone-500">
                  Noch keine neuen Marken gefunden.
                </div>
              )}
              {newHits.map((h) => (
                <Link
                  key={h.aktenzeichen}
                  href={`/trademarks/${h.id ?? ""}`}
                  className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 transition hover:bg-white/90"
                >
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    (h.score ?? 0) >= 7 ? "bg-rose-100 text-rose-900" : (h.score ?? 0) >= 4 ? "bg-amber-100 text-amber-900" : "bg-stone-200/70 text-stone-700"
                  }`}>
                    {h.score ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-stone-900">{h.markenname}</div>
                    <div className="flex items-center gap-2 text-[11px] text-stone-500">
                      <span>{h.aktenzeichen}</span>
                      {h.website && (
                        <a
                          href={h.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="truncate text-stone-600 hover:text-stone-900 hover:underline"
                        >
                          {new URL(h.website).hostname}
                        </a>
                      )}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-stone-400">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "emerald" | "red" }) {
  const tones = { slate: "text-stone-900", emerald: "text-emerald-700", red: "text-rose-700" };
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`text-sm font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}
