"use client";

import { useState } from "react";
import { ScanClient } from "./scan-client";
import { DpmaScanClient } from "@/app/trademarks/scan/dpma-scan-client";

type ScanType = "web" | "register" | "all";

const SCAN_TYPES: { value: ScanType; label: string; sub: string; icon: string }[] = [
  {
    value: "web",
    label: "Web-Scan",
    sub: "Durchsucht das Internet nach Markenrechtsverletzungen via Gemini",
    icon: "M12 2a10 10 0 100 20A10 10 0 0012 2z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
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
    sub: "Web (DE·Quick) + DPMA + EUIPO + HR — alles vorkonfiguriert",
    icon: "M21 21l-4.3-4.3 M11 19a8 8 0 100-16 8 8 0 000 16z",
  },
];

const ALL_SCAN_CHIPS = [
  { label: "Web · Deutschland · Quick", color: "bg-sky-100 text-sky-800" },
  { label: "DPMA-Register", color: "bg-violet-100 text-violet-800" },
  { label: "EUIPO-Register", color: "bg-blue-100 text-blue-800" },
  { label: "Handelsregister (HR)", color: "bg-amber-100 text-amber-800" },
];

export function UnifiedScanClient() {
  const [scanType, setScanType] = useState<ScanType>("web");

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Header */}
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

      {scanType === "all" && (
        <div className="flex min-h-0 flex-col gap-4">
          {/* Pre-configured summary */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200/60 bg-stone-50/60 px-4 py-3">
            <span className="mr-1 text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Wird gescannt:</span>
            {ALL_SCAN_CHIPS.map((c) => (
              <span key={c.label} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.color}`}>
                {c.label}
              </span>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="flex min-h-0 flex-col">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700">Web</span>
                <span className="text-xs text-stone-500">Deutschland · Quick · kein Agent nötig</span>
              </div>
              <ScanClient hideControls defaultRegion="deutschland" defaultMode="quick" />
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700">Register</span>
                <span className="text-xs text-stone-500">DPMA + EUIPO + HR · lokaler Agent</span>
              </div>
              <DpmaScanClient hideFilters defaultSource="all" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
