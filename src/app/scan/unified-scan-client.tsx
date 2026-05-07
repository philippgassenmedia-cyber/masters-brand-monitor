"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ScanClient } from "./scan-client";
import { DpmaScanClient } from "@/app/trademarks/scan/dpma-scan-client";
import { useScan } from "@/components/scan-context";

type ScanType = "web" | "register" | "all";

const SCAN_TYPES: { value: ScanType; label: string; sub: string; icon: string }[] = [
  {
    value: "web",
    label: "Web-Scan",
    sub: "Durchsucht das Internet nach Markenrechtsverletzungen via Gemini",
    icon: "M12 2a10 10 0 100 20A10 10 0 0012 2z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 014-10z",
  },
  {
    value: "register",
    label: "Register-Scan",
    sub: "Durchsucht DPMA · EUIPO · Handelsregister via lokalem Agenten",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
  {
    value: "all",
    label: "Alles scannen",
    sub: "Web (DE·Quick) + DPMA + EUIPO + HR — ein Klick startet alles",
    icon: "M21 21l-4.3-4.3 M11 19a8 8 0 100-16 8 8 0 000 16z",
  },
];

// ── Agent-state types (minimal, for "all" panel) ─────────────────────────────
type AgentPhase = "idle" | "pending" | "running" | "done" | "error";

interface AgentState {
  phase: AgentPhase;
  jobId: string | null;
  newCount: number;
  log: string;
}

const AGENT_IDLE: AgentState = { phase: "idle", jobId: null, newCount: 0, log: "" };

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${(sec % 60).toString().padStart(2, "0")}s`;
}

// ── Combined "Alles scannen" panel ───────────────────────────────────────────
function AllScanPanel() {
  const { state: web, startScan, stopScan } = useScan();
  const [agent, setAgent] = useState<AgentState>(AGENT_IDLE);
  const [now, setNow] = useState(Date.now());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenAzRef = useRef<Set<string>>(new Set());

  const webRunning = web.running && web.source === "web";
  const webDone = web.source === "web" && web.phase === "done";
  const agentRunning = agent.phase === "pending" || agent.phase === "running";
  const bothDone = (webDone || web.source !== "web") && (agent.phase === "done" || agent.phase === "error");
  const anyRunning = webRunning || agentRunning;

  // Timer
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const runPoll = useCallback(async (sinceTs: string, jobId: string) => {
    try {
      // Job status
      const scansRes = await fetch("/api/scheduled-scans");
      if (scansRes.ok) {
        const { scans } = await scansRes.json() as { scans: Array<{ id: string; status: string }> };
        const job = scans.find((s) => s.id === jobId);
        if (job?.status === "completed" || job?.status === "partial") {
          stopPoll();
          setAgent((prev) => ({ ...prev, phase: "done", log: "Register-Scan abgeschlossen" }));
        } else if (job?.status === "running") {
          setAgent((prev) => prev.phase === "pending" ? { ...prev, phase: "running", log: "Agent durchsucht Register…" } : prev);
        }
      }
      // New trademarks
      const sinceWithBuffer = new Date(new Date(sinceTs).getTime() - 60_000).toISOString();
      const tmRes = await fetch(`/api/trademarks/recent?since=${encodeURIComponent(sinceWithBuffer)}`);
      if (tmRes.ok) {
        const { trademarks } = await tmRes.json() as { trademarks: Array<{ aktenzeichen: string }> };
        const newOnes = trademarks.filter((t) => !seenAzRef.current.has(t.aktenzeichen));
        newOnes.forEach((t) => seenAzRef.current.add(t.aktenzeichen));
        if (newOnes.length > 0) {
          setAgent((prev) => ({ ...prev, newCount: prev.newCount + newOnes.length }));
        }
      }
    } catch { /* network hiccup */ }
  }, [stopPoll]);

  const startAll = async () => {
    const ts = Date.now();
    setStartedAt(ts);
    seenAzRef.current.clear();

    // Start web scan
    startScan(["/api/scan/stream"], { region: "deutschland", mode: "quick" }, "web");

    // Start register scan (agent)
    const sinceTs = new Date().toISOString();
    setAgent({ phase: "pending", jobId: null, newCount: 0, log: "Erstelle Scan-Auftrag…" });
    try {
      await fetch("/api/scheduled-scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: sinceTs, scan_type: "all", notes: "Alles scannen · UI" }),
      });
      const listRes = await fetch("/api/scheduled-scans");
      const { scans } = await listRes.json() as { scans: Array<{ id: string; status: string; scheduled_at: string }> };
      const job = scans.find((s) => s.status === "pending" && s.scheduled_at >= sinceTs.slice(0, 16));
      const jobId = job?.id ?? "";
      setAgent((prev) => ({ ...prev, jobId, log: "Warte auf lokalen Agenten (DPMA + EUIPO + HR)…" }));
      stopPoll();
      pollRef.current = setInterval(() => runPoll(sinceTs, jobId), 5000);
    } catch (e) {
      setAgent({ phase: "error", jobId: null, newCount: 0, log: `Fehler: ${(e as Error).message}` });
    }
  };

  const stopAll = () => {
    stopScan();
    stopPoll();
    setAgent(AGENT_IDLE);
    seenAzRef.current.clear();
    setStartedAt(null);
  };

  const reset = () => {
    setAgent(AGENT_IDLE);
    seenAzRef.current.clear();
    setStartedAt(null);
  };

  const elapsed = startedAt ? now - startedAt : 0;
  const isIdle = !anyRunning && agent.phase === "idle" && web.phase === "idle";

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200/60 bg-stone-50/60 px-4 py-3">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Wird gescannt:</span>
        {[
          { label: "Web · Deutschland · Quick", color: "bg-sky-100 text-sky-800" },
          { label: "DPMA-Register", color: "bg-violet-100 text-violet-800" },
          { label: "EUIPO-Register", color: "bg-blue-100 text-blue-800" },
          { label: "Handelsregister (HR)", color: "bg-amber-100 text-amber-800" },
        ].map((c) => (
          <span key={c.label} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.color}`}>
            {c.label}
          </span>
        ))}
      </div>

      {/* Combined status + single button */}
      <section className="glass px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-3 sm:grid-cols-2 flex-1">
            {/* Web status */}
            <div className="flex items-center gap-2.5">
              {webRunning ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
                </span>
              ) : webDone ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-300" />
              )}
              <div>
                <div className="text-xs font-semibold text-stone-800">
                  Web · {webRunning ? "läuft" : webDone ? "fertig" : "bereit"}
                </div>
                {(webRunning || webDone) && web.source === "web" && (
                  <div className="text-[10px] text-stone-500">
                    {web.newHits} neu · {web.queriesCount} Abfragen
                  </div>
                )}
              </div>
            </div>

            {/* Register status */}
            <div className="flex items-center gap-2.5">
              {agentRunning ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
                </span>
              ) : agent.phase === "done" ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
              ) : agent.phase === "error" ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-stone-300" />
              )}
              <div>
                <div className="text-xs font-semibold text-stone-800">
                  Register · {agent.phase === "pending" ? "warte auf Agent" : agent.phase === "running" ? "läuft" : agent.phase === "done" ? "fertig" : agent.phase === "error" ? "Fehler" : "bereit"}
                </div>
                {agent.log && (
                  <div className="text-[10px] text-stone-500 line-clamp-1">{agent.log}</div>
                )}
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-3">
            {startedAt && (
              <span className="text-[11px] tabular-nums text-stone-500">{formatDuration(elapsed)}</span>
            )}
            {isIdle ? (
              <button
                onClick={startAll}
                className="h-11 rounded-full bg-stone-900 px-8 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800"
              >
                Alles starten
              </button>
            ) : anyRunning ? (
              <button
                onClick={stopAll}
                className="h-11 rounded-full border border-rose-200 bg-rose-50/80 px-8 text-sm font-semibold text-rose-800 hover:bg-rose-100"
              >
                Abbrechen
              </button>
            ) : bothDone ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  className="h-11 rounded-full border border-stone-200 bg-white/70 px-5 text-xs font-semibold text-stone-700 hover:bg-white flex items-center"
                >
                  Ergebnisse
                </Link>
                <button
                  onClick={reset}
                  className="h-11 rounded-full bg-stone-900 px-6 text-xs font-semibold text-white hover:bg-stone-800"
                >
                  Neu starten
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Pending agent hint */}
        {agent.phase === "pending" && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900">
            <strong>Agent noch nicht aktiv?</strong>{" "}
            Lade den Agenten unter{" "}
            <Link href="/scan?tab=register" className="underline font-semibold">Register-Scan</Link>{" "}
            herunter und starte ihn lokal.
          </div>
        )}
      </section>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function UnifiedScanClient() {
  const [scanType, setScanType] = useState<ScanType>("web");

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <h1 className="text-2xl font-semibold text-stone-900">Scan</h1>

      {/* Type selection cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SCAN_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setScanType(t.value)}
            className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
              scanType === t.value
                ? "border-stone-900 bg-stone-900 text-white shadow-lg"
                : "border-white/70 bg-white/50 text-stone-800 hover:bg-white/80 hover:border-stone-200"
            }`}
          >
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              scanType === t.value ? "bg-white/20" : "bg-stone-100"
            }`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={scanType === t.value ? "text-white" : "text-stone-600"}>
                {t.icon.split(" M").map((seg, i) => <path key={i} d={i === 0 ? seg : "M" + seg} />)}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${scanType === t.value ? "text-white" : "text-stone-900"}`}>
                {t.label}
              </div>
              <div className={`mt-0.5 text-[11px] leading-snug ${scanType === t.value ? "text-white/70" : "text-stone-500"}`}>
                {t.sub}
              </div>
            </div>
            {scanType === t.value && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/80 mt-0.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Scan panels */}
      {scanType === "web" && <ScanClient />}
      {scanType === "register" && <DpmaScanClient />}
      {scanType === "all" && <AllScanPanel />}
    </div>
  );
}
