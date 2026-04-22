"use client";

import Link from "next/link";
import { useState } from "react";
import { useScan } from "./scan-context";

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${(sec % 60).toString().padStart(2, "0")}s`;
}

const SOURCE_LABEL: Record<string, string> = {
  web: "Web-Scan",
  dpma: "DPMA-Suche",
  euipo: "EUIPO-Suche",
};

export function ScanOverlay() {
  const { state, stopScan, clearScan } = useScan();
  const [expanded, setExpanded] = useState(false);

  // Nichts anzeigen wenn idle
  if (state.phase === "idle") return null;

  const elapsed = state.startedAt ? Date.now() - state.startedAt : 0;
  const pct =
    state.progress.total > 0
      ? Math.round((state.progress.current / state.progress.total) * 100)
      : 0;
  const isDone = state.phase === "done" || state.phase === "stopped";
  const isError = state.phase === "error";

  const scanPageHref = state.source === "web" ? "/scan" : "/trademarks/scan";

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Minimiert: kleiner Pill */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-xl transition hover:scale-105 ${
            isDone
              ? "bg-emerald-900/90 text-emerald-100"
              : isError
                ? "bg-rose-900/90 text-rose-100"
                : "bg-stone-900/90 text-white"
          }`}
        >
          {state.running && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          )}
          {isDone && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          )}
          <span>{SOURCE_LABEL[state.source ?? ""] ?? "Scan"}</span>
          {state.running && pct > 0 && <span className="opacity-70">{pct}%</span>}
          {state.newHits > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              +{state.newHits}
            </span>
          )}
        </button>
      )}

      {/* Expandiert: Detail-Card */}
      {expanded && (
        <div className="w-72 rounded-2xl border border-white/60 bg-white/90 p-4 shadow-[0_12px_48px_rgba(0,0,0,0.2)] backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {state.running && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              )}
              {isDone && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
              {isError && <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />}
              <span className="text-xs font-semibold text-stone-900">
                {SOURCE_LABEL[state.source ?? ""] ?? "Scan"}
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-stone-400 hover:text-stone-800"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6" /></svg>
            </button>
          </div>

          <div className="mt-2 text-[11px] text-stone-600 line-clamp-2">
            {state.lastMessage}
          </div>

          {/* Progress Bar */}
          {state.progress.total > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isDone ? "bg-emerald-500" : "bg-stone-900"
                }`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          )}

          {/* Stats */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-stone-500">
            {state.running && <span>{formatDuration(elapsed)}</span>}
            {isDone && <span>Dauer: {formatDuration(elapsed)}</span>}
            <span className="font-semibold text-emerald-700">+{state.newHits} neu</span>
            {state.errors > 0 && (
              <span className="text-rose-600">{state.errors} Fehler</span>
            )}
            {state.progress.total > 0 && (
              <span>
                {state.progress.current}/{state.progress.total}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex gap-2">
            <Link
              href={scanPageHref}
              className="flex-1 rounded-full bg-stone-900 px-3 py-1.5 text-center text-[10px] font-semibold text-white hover:bg-stone-800"
            >
              Details öffnen
            </Link>
            {state.running && (
              <button
                onClick={stopScan}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
              >
                Stopp
              </button>
            )}
            {isDone && (
              <button
                onClick={() => { setExpanded(false); clearScan(); }}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-100"
              >
                Schließen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
