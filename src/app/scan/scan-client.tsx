"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GermanyMap, type ScanCity } from "@/components/germany-map";
import { useScan } from "@/components/scan-context";

type SearchRegion = "deutschland" | "hessen" | "dach" | "eu" | "welt";
type ScanMode = "quick" | "deep";

interface NewHit {
  id: string;
  domain: string;
  score: number | null;
  company: string | null;
  url: string;
}

const REGIONS: { value: SearchRegion; label: string }[] = [
  { value: "hessen", label: "Hessen" },
  { value: "deutschland", label: "Deutschland" },
  { value: "dach", label: "DACH" },
  { value: "eu", label: "Europa" },
  { value: "welt", label: "Weltweit" },
];

const SCAN_CITIES: ScanCity[] = [
  { name: "Frankfurt", lat: 50.11, lng: 8.68 },
  { name: "Berlin", lat: 52.52, lng: 13.41 },
  { name: "Hamburg", lat: 53.55, lng: 9.99 },
  { name: "München", lat: 48.14, lng: 11.58 },
  { name: "Köln", lat: 50.94, lng: 6.96 },
  { name: "Stuttgart", lat: 48.78, lng: 9.18 },
  { name: "Düsseldorf", lat: 51.23, lng: 6.78 },
  { name: "Leipzig", lat: 51.34, lng: 12.37 },
  { name: "Hannover", lat: 52.37, lng: 9.74 },
  { name: "Nürnberg", lat: 49.45, lng: 11.08 },
  { name: "Dresden", lat: 51.05, lng: 13.74 },
  { name: "Bremen", lat: 53.08, lng: 8.81 },
  { name: "Dortmund", lat: 51.51, lng: 7.47 },
  { name: "Essen", lat: 51.46, lng: 7.01 },
  { name: "Kassel", lat: 51.32, lng: 9.5 },
  { name: "Wiesbaden", lat: 50.08, lng: 8.24 },
  { name: "Darmstadt", lat: 49.87, lng: 8.65 },
  { name: "Mainz", lat: 50.0, lng: 8.27 },
];

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${(sec % 60).toString().padStart(2, "0")}s`;
}

export function ScanClient() {
  const { state, startScan, stopScan } = useScan();

  // Local UI state only
  const [region, setRegion] = useState<SearchRegion>("deutschland");
  const [mode, setMode] = useState<ScanMode>("quick");
  const [freeText, setFreeText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showSuccess, setShowSuccess] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const prevPhaseRef = useRef<string>(state.phase);

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
    if (state.source !== "web") return;
    if (prevPhaseRef.current !== "done" && state.phase === "done") {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.source]);

  // Derived state from context — only relevant when this source is active
  const isWebScan = state.source === "web";
  const running = state.running && isWebScan;
  const phase = isWebScan ? state.phase : "idle";
  const log = isWebScan ? state.log : [];
  const progress = isWebScan ? state.progress : { current: 0, total: 0 };
  const startedAt = isWebScan ? state.startedAt : null;
  const cityStates = isWebScan ? state.cityStates : {};
  const hitCounts = isWebScan ? state.hitCounts : {};
  const kpis = {
    queries: isWebScan ? state.queriesCount : 0,
    raw: isWebScan ? state.rawCount : 0,
    newHits: isWebScan ? state.newHits : 0,
    updated: isWebScan ? state.updatedCount : 0,
    errors: isWebScan ? state.errors : 0,
  };
  const newHits: NewHit[] = isWebScan
    ? state.rawHits.map((h: Record<string, unknown>) => ({
        id: String(h.id ?? ""),
        domain: String(h.domain ?? ""),
        score: (h.score as number | null) ?? null,
        company: (h.company as string | null) ?? null,
        url: String(h.url ?? ""),
      }))
    : [];

  const start = () => {
    startScan(["/api/scan/stream"], { region, mode, freeText: freeText || undefined }, "web");
  };

  const elapsed = startedAt ? now - startedAt : 0;
  const pct = progress.total > 0 ? progress.current / progress.total : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Web Live-Scan</h1>
        <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">
          ← Dashboard
        </Link>
      </header>

      {/* Controls — hide while a web scan is active */}
      {!isWebScan || phase === "idle" ? (
        <section className="glass mb-3 p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Region */}
              <div>
                <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
                  Region
                </div>
                <div className="inline-flex rounded-full border border-white/80 bg-orange-50/70 p-1 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md">
                  {REGIONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRegion(r.value)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        region === r.value
                          ? "bg-stone-900 text-white shadow"
                          : "text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode */}
              <div>
                <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
                  Modus
                </div>
                <div className="inline-flex rounded-full border border-white/80 bg-orange-50/70 p-1 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setMode("quick")}
                    className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
                      mode === "quick"
                        ? "bg-stone-900 text-white shadow"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Quick
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("deep")}
                    className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
                      mode === "deep"
                        ? "bg-stone-900 text-white shadow"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Deep
                  </button>
                </div>
              </div>

              {/* Free text */}
              <div>
                <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
                  Freitext (optional)
                </div>
                <input
                  type="text"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="z.B. Hausverwaltung Master"
                  className="h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:bg-white/90"
                />
              </div>
            </div>

            <div className="flex items-end">
              <div className="text-[11px] text-stone-500">
                Quick: ~5–15 Abfragen · Deep: ~30–80 Abfragen
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Status bar */}
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
                {phase === "idle"
                  ? "Bereit"
                  : phase === "searching" || phase === "running"
                    ? "Suche läuft"
                    : phase === "done"
                      ? "Scan abgeschlossen"
                      : "Verbinde…"}
              </div>
              <div className="text-[11px] text-stone-500">
                {running
                  ? `Verstrichen: ${formatDuration(elapsed)}`
                  : phase === "done"
                    ? `Dauer: ${formatDuration(elapsed)}`
                    : "Durchsucht das Web nach Markenrechtsverletzungen"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(running || phase === "done") && isWebScan && (
              <div className="flex items-center gap-3 text-right">
                <MiniStat label="Abfragen" value={kpis.queries} />
                <MiniStat label="Roh" value={kpis.raw} />
                <MiniStat label="Neu" value={kpis.newHits} tone="emerald" />
                <MiniStat label="Updates" value={kpis.updated} />
                {kpis.errors > 0 && <MiniStat label="Fehler" value={kpis.errors} tone="red" />}
              </div>
            )}
            {!running ? (
              <button
                onClick={start}
                className="h-10 rounded-full bg-stone-900 px-6 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800"
              >
                Scan starten
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
        {(running || phase === "done") && isWebScan && progress.total > 0 && (
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
        <div
          className="success-overlay absolute inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-sm"
          onClick={() => setShowSuccess(false)}
        >
          <div className="success-card glass-strong flex min-w-[320px] flex-col items-center gap-3 px-10 py-8">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-200">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#047857"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <div className="text-lg font-semibold text-stone-900">Scan abgeschlossen</div>
            <div className="text-sm text-stone-600">
              {kpis.newHits} neue Treffer · {kpis.updated} aktualisiert · {formatDuration(elapsed)}
            </div>
            <Link
              href="/"
              className="mt-2 rounded-full bg-stone-900 px-5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
            >
              Zum Dashboard
            </Link>
          </div>
        </div>
      )}

      {/* Map + Log + Results */}
      {isWebScan && (running || log.length > 0) && (
        <section className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)]">
          {/* Germany Map */}
          <div className="glass flex flex-col overflow-hidden p-4">
            <h2 className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wider text-stone-600">
              Abdeckung
            </h2>
            <div className="flex items-center justify-center" style={{ height: 300 }}>
              <GermanyMap cities={SCAN_CITIES} states={cityStates} hitCount={hitCounts} />
            </div>
          </div>

          {/* Log */}
          <div className="glass flex flex-col p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
              Live-Log
            </h2>
            <div className="scroll-area overflow-y-auto rounded-xl bg-stone-950 p-3 font-mono text-[11px] text-stone-200" style={{ height: 300 }}>
              {log.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.tone === "err"
                      ? "text-rose-300"
                      : l.tone === "warn"
                        ? "text-amber-300"
                        : l.tone === "ok"
                          ? "text-emerald-300"
                          : "text-stone-200"
                  }
                >
                  <span className="mr-2 text-stone-500">
                    {new Date(l.ts).toLocaleTimeString("de-DE")}
                  </span>
                  {l.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* New hits */}
          <div className="glass flex flex-col p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">
              Neue Treffer · {newHits.length}
            </h2>
            <div className="scroll-area space-y-2 overflow-y-auto pr-1" style={{ height: 300 }}>
              {newHits.length === 0 && !running && (
                <div className="flex h-full items-center justify-center text-xs text-stone-500">
                  Noch keine neuen Treffer.
                </div>
              )}
              {newHits.map((h) => (
                <Link
                  key={h.id}
                  href={`/hits/${h.id}`}
                  className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2.5 transition hover:bg-white/90"
                >
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      (h.score ?? 0) >= 7
                        ? "bg-rose-100 text-rose-900"
                        : (h.score ?? 0) >= 4
                          ? "bg-amber-100 text-amber-900"
                          : "bg-stone-200/70 text-stone-700"
                    }`}
                  >
                    {h.score ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-stone-900">
                      {h.company ?? h.domain}
                    </div>
                    <div className="truncate text-[11px] text-stone-500">{h.url}</div>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-stone-400"
                  >
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

function MiniStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "red";
}) {
  const tones = { slate: "text-stone-900", emerald: "text-emerald-700", red: "text-rose-700" };
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`text-sm font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}
