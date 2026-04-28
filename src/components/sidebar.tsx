"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UsageRing } from "./usage-ring";
import { useScan } from "./scan-context";

const NAV: Array<{ href: string; label: string; icon: ReactNode }> = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/scan",
    label: "Live-Scan",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    ),
  },
  {
    href: "/trademarks",
    label: "DPMA-Register",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    href: "/excluded",
    label: "Eigene Domains",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7l-9 9-5-5" />
        <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
      </svg>
    ),
  },
  {
    href: "/exports",
    label: "Anwalts-Export",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
];

const USAGE_LABELS: Record<string, string> = {
  gemini_search: "Web-Suche",
  gemini_analyze: "Web-Analyse",
  gemini_dpma: "DPMA-Bewertung",
  gemini_resolve: "Website-Lookup",
  gemini_parse: "Mail-Parsing",
};

export function Sidebar({
  userEmail,
  usageCount = 0,
  usageLimit = 200,
  usageBreakdown = {},
  buildSha = "—",
}: {
  userEmail?: string | null;
  usageCount?: number;
  usageLimit?: number;
  usageBreakdown?: Record<string, number>;
  buildSha?: string;
}) {
  const pathname = usePathname();
  const initial = (userEmail ?? "U").slice(0, 1).toUpperCase();
  const { state: scan, stopScan } = useScan();

  const scanActive = scan.phase !== "idle";
  const scanRunning = scan.running;
  const scanPct = scan.progress.total > 0 ? Math.round((scan.progress.current / scan.progress.total) * 100) : 0;
  const scanHref = scan.source === "web" ? "/scan" : "/trademarks/scan";
  const SOURCE_LABEL: Record<string, string> = { web: "Web-Scan", dpma: "DPMA-Suche", euipo: "EUIPO-Suche" };
  const latestHits = scan.rawHits.slice(0, 3) as Array<Record<string, unknown>>;
  return (
    <aside className="glass-sidebar relative z-10 flex h-full w-full shrink-0 flex-col overflow-hidden p-4 md:w-60 md:p-5">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 text-lg font-black text-white shadow-sm">
          M
        </div>
        <div>
          <div className="text-sm font-semibold text-stone-900">Brand Monitor</div>
          <div className="text-[10px] uppercase tracking-wide text-stone-500">
            Master Immobilien
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          Navigation
        </div>
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href.split("?")[0]);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                active
                  ? "bg-stone-900 text-white shadow-sm"
                  : "text-stone-600 hover:bg-white/60 hover:text-stone-900"
              }`}
            >
              {active && (
                <span className="absolute -left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-white/80 badge-animate" />
              )}
              <span className={`transition-colors duration-150 ${active ? "text-white" : "text-stone-400"}`}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {scanActive && (
        <div className="mx-1 mt-4">
          <Link
            href={scanHref}
            className="block rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5 transition hover:bg-emerald-100/80"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {scanRunning ? (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                )}
                <span className="text-xs font-semibold text-emerald-900">
                  {SOURCE_LABEL[scan.source ?? ""] ?? "Scan"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-700">
                {scan.newHits > 0 && (
                  <span className="rounded-full bg-emerald-200/70 px-1.5 py-0.5 font-semibold">
                    +{scan.newHits}
                  </span>
                )}
                {scanPct > 0 && <span>{scanPct}%</span>}
              </div>
            </div>
            <p className="mt-1 line-clamp-1 text-[10px] text-emerald-700">{scan.lastMessage}</p>
            {scan.progress.total > 0 && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-emerald-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${Math.max(2, scanPct)}%` }}
                />
              </div>
            )}
            {/* Letzte Treffer direkt in der Sidebar */}
            {latestHits.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-emerald-200/60 pt-2">
                {latestHits.map((h, i) => {
                  const label = String(h.domain ?? h.markenname ?? "");
                  const id = String(h.id ?? "");
                  const az = String(h.aktenzeichen ?? "");
                  const href = id
                    ? (scan.source === "web" ? `/hits/${id}` : `/trademarks/${id}`)
                    : az ? `https://register.dpma.de/DPMAregister/marke/register/${az}/DE` : "#";
                  return (
                    <a
                      key={i}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[10px] text-emerald-800 hover:bg-emerald-100"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span className="truncate">{label}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </Link>
          {scanRunning && (
            <button
              onClick={stopScan}
              className="mt-1 w-full rounded-lg px-2 py-1 text-center text-[10px] text-stone-500 hover:bg-white/60 hover:text-rose-700"
            >
              Abbrechen
            </button>
          )}
        </div>
      )}

      <div className="mt-auto w-full space-y-3">
        <div className="w-full rounded-xl border border-white/70 bg-white/50 px-3 py-3">
          <UsageRing count={usageCount} limit={usageLimit} label="Gemini API" />
          {Object.keys(usageBreakdown).length > 0 && (
            <div className="mt-2 space-y-0.5 border-t border-white/60 pt-2">
              {Object.entries(usageBreakdown)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between text-[10px]">
                    <span className="text-stone-500">{USAGE_LABELS[key] ?? key}</span>
                    <span className="font-semibold text-stone-700">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <Link
          href="/account"
          className="relative z-20 flex cursor-pointer items-center gap-3 rounded-xl border border-white/70 bg-white/60 px-3 py-3 transition hover:bg-white/90"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">
              Eingeloggt
            </div>
            <div
              className="truncate text-xs font-semibold text-stone-800"
              title={userEmail ?? ""}
            >
              {userEmail ?? "—"}
            </div>
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>

      <div className="mt-2 text-center">
        <span className="text-[9px] tabular-nums text-stone-300 select-none">
          {buildSha}
        </span>
      </div>
    </aside>
  );
}
