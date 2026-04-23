"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useScan } from "./scan-context";

type Region = "hessen" | "deutschland" | "dach" | "eu" | "welt";
type Mode = "quick" | "deep";

const REGIONS: { value: Region; label: string }[] = [
  { value: "hessen", label: "Hessen" },
  { value: "deutschland", label: "Deutschland" },
  { value: "dach", label: "DACH" },
  { value: "eu", label: "Europa" },
  { value: "welt", label: "Weltweit" },
];

function scoreBg(score: number | null) {
  if (score === null) return "bg-stone-100 text-stone-500";
  if (score >= 7) return "bg-rose-100 text-rose-800";
  if (score >= 4) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function fmt(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, "0")}s`;
}

export function MobileWebScan() {
  const { state, startScan, stopScan } = useScan();
  const [region, setRegion] = useState<Region>("deutschland");
  const [mode, setMode] = useState<Mode>("quick");
  const [now, setNow] = useState(Date.now());
  const logEndRef = useRef<HTMLDivElement>(null);

  const isWeb = state.source === "web";
  const running = state.running && isWeb;
  const phase = isWeb ? state.phase : "idle";

  const newHits = isWeb
    ? state.rawHits.map((h: Record<string, unknown>) => ({
        id: String(h.id ?? ""),
        domain: String(h.domain ?? ""),
        score: (h.score as number | null) ?? null,
        company: (h.company as string | null) ?? null,
        url: String(h.url ?? ""),
      }))
    : [];

  const kpis = {
    queries: isWeb ? state.queriesCount : 0,
    newHits: isWeb ? state.newHits : 0,
    errors: isWeb ? state.errors : 0,
  };

  const elapsed = state.startedAt ? now - state.startedAt : 0;
  const pct = state.progress.total > 0 ? state.progress.current / state.progress.total : 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.log]);

  const start = () =>
    startScan(["/api/scan/stream"], { region, mode }, "web");

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-stone-900">Gemini Cloud-Suche</h1>
        <Link href="/" className="text-xs text-stone-500">← Dashboard</Link>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-xs text-blue-700">
        Läuft in der Cloud — kein lokales Gerät nötig.
      </div>

      {/* Controls */}
      {(!isWeb || phase === "idle") && (
        <section className="glass p-4">
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-stone-500">Region</div>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRegion(r.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    region === r.value
                      ? "bg-stone-900 text-white"
                      : "bg-white/70 text-stone-600 ring-1 ring-stone-200"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-stone-500">Modus</div>
            <div className="inline-flex rounded-full bg-stone-100/80 p-1">
              {(["quick", "deep"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-5 py-1.5 text-xs font-semibold transition ${
                    mode === m ? "bg-stone-900 text-white" : "text-stone-500"
                  }`}
                >
                  {m === "quick" ? "Quick" : "Deep"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-stone-400">
              {mode === "quick" ? "~5–15 Abfragen, ~5 Min." : "~30–80 Abfragen, ~15–30 Min."}
            </p>
          </div>

          <button
            onClick={start}
            className="w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(28,25,23,0.25)] active:scale-[0.98] transition"
          >
            Cloud-Scan starten
          </button>
        </section>
      )}

      {/* Status */}
      {isWeb && phase !== "idle" && (
        <section className="glass p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {running ? (
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
              ) : (
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
              )}
              <div>
                <div className="text-sm font-semibold text-stone-900">
                  {phase === "done" ? "Abgeschlossen" : "Läuft…"}
                </div>
                <div className="text-[11px] text-stone-500">{fmt(elapsed)} · {kpis.queries} Abfragen · {kpis.newHits} neu</div>
              </div>
            </div>
            {running && (
              <button
                onClick={stopScan}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-1.5 text-xs font-semibold text-rose-700"
              >
                Stop
              </button>
            )}
          </div>

          {state.progress.total > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${phase === "done" ? "bg-emerald-500" : "bg-stone-900"}`}
                style={{ width: `${Math.max(2, pct * 100)}%` }}
              />
            </div>
          )}

          {kpis.errors > 0 && (
            <p className="mt-2 text-[11px] text-rose-600">{kpis.errors} Fehler</p>
          )}

          {phase === "done" && (
            <Link
              href="/"
              className="mt-3 block w-full rounded-xl bg-emerald-600 py-2.5 text-center text-xs font-semibold text-white"
            >
              Dashboard öffnen →
            </Link>
          )}
        </section>
      )}

      {/* Live log — collapsed on mobile */}
      {isWeb && state.log.length > 0 && (
        <details className="glass overflow-hidden rounded-2xl">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-stone-600">
            Live-Log ({state.log.length} Einträge)
          </summary>
          <div className="max-h-48 overflow-y-auto bg-stone-950 p-3 font-mono text-[10px] text-stone-300">
            {state.log.slice(-50).map((l, i) => (
              <div
                key={i}
                className={
                  l.tone === "err" ? "text-rose-300" :
                  l.tone === "ok" ? "text-emerald-300" : "text-stone-300"
                }
              >
                {l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </details>
      )}

      {/* Results */}
      {newHits.length > 0 && (
        <section className="glass p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
            Neue Treffer · {newHits.length}
          </h2>
          <div className="space-y-2">
            {newHits.map((h) => (
              <Link
                key={h.id || h.url}
                href={h.id ? `/hits/${h.id}` : "#"}
                className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2.5 active:bg-white transition"
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${scoreBg(h.score)}`}>
                  {h.score ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-stone-900">{h.company ?? h.domain}</div>
                  <div className="truncate text-[11px] text-stone-400">{h.domain}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-300">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            ))}
          </div>
          <Link href="/hits" className="mt-3 block text-center text-xs text-stone-400 hover:text-stone-700">
            Alle Treffer anzeigen →
          </Link>
        </section>
      )}
    </div>
  );
}
