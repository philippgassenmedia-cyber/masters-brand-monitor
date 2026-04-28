"use client";

import Link from "next/link";
import { useState } from "react";
import { ExcludeButton } from "./exclude-button";
import type { HitStatus } from "@/lib/types";

const STATUS_LABEL: Record<HitStatus, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

function scoreBadge(score: number | null) {
  if (score === null) return "bg-stone-200/70 text-stone-700";
  if (score >= 7) return "bg-rose-100/80 text-rose-900";
  if (score >= 4) return "bg-amber-100/80 text-amber-900";
  return "bg-emerald-100/70 text-emerald-900";
}

function detectSector(reasoning: string | null): "immobilien" | "beratung" | null {
  if (!reasoning) return null;
  const r = reasoning.toLowerCase();
  if (/immobili|makler|hausverwalt|mietverwalt|bautr|property|real.estate|gewerbeimmobil|wohnungsvermittl/.test(r)) return "immobilien";
  if (/unternehmensberatung|consulting|management.beratung|business.consult/.test(r)) return "beratung";
  return null;
}

export interface HitGroupRow {
  key: string;
  title: string;
  primaryId: string;
  primaryDomain: string;
  maxScore: number | null;
  status: HitStatus;
  reasoning: string | null;
  snippet: string | null;
  lastSeen: string;
  totalCount: number;
  relatedUrls: string[];
  city: string | null;
}

const INITIAL_VISIBLE = 25;

export function HitsTable({
  groups,
  totalUrls,
}: {
  groups: HitGroupRow[];
  totalUrls: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? groups : groups.slice(0, INITIAL_VISIBLE);
  const hasMore = groups.length > INITIAL_VISIBLE;

  return (
    <section className="glass mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-stone-900">
          Treffer
          {groups.length > 0 && (
            <span className="text-stone-500">
              {" "}· {groups.length} {groups.length === 1 ? "Firma" : "Firmen"} · {totalUrls} URLs
            </span>
          )}
        </h2>
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Score</th>
              <th className="px-5 py-3 font-semibold">Domain / Firma</th>
              <th className="px-5 py-3 font-semibold">Begründung</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Zuletzt</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-stone-500">
                  Keine Treffer für diesen Filter.
                </td>
              </tr>
            )}
            {visible.map((g, idx) => {
              const isLast = !showAll && hasMore && idx === visible.length - 1;
              return (
                <tr
                  key={g.key}
                  className={`border-t border-white/50 transition hover:bg-white/50 ${
                    isLast ? "fade-row" : ""
                  }`}
                >
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${scoreBadge(
                        g.maxScore,
                      )}`}
                    >
                      {g.maxScore ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/hits/${g.primaryId}`}
                        className="font-semibold text-stone-900 hover:text-stone-600"
                      >
                        {g.title}
                      </Link>
                      {g.totalCount > 1 && (
                        <span
                          className="rounded-full bg-stone-900/90 px-2 py-0.5 text-[10px] font-semibold text-white"
                          title={g.relatedUrls.join("\n")}
                        >
                          +{g.totalCount - 1}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const sector = detectSector(g.reasoning);
                      return sector ? (
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          sector === "immobilien"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-sky-100 text-sky-800"
                        }`}>
                          {sector === "immobilien" ? "Immobilien" : "Beratung"}
                        </span>
                      ) : null;
                    })()}
                    {g.city && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                          <circle cx="12" cy="9" r="2.5"/>
                        </svg>
                        {g.city}
                      </div>
                    )}
                  </td>
                  <td className="max-w-md px-5 py-3 text-stone-700">
                    <div className="line-clamp-2 text-[13px]">
                      {g.reasoning ?? g.snippet}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-stone-700 ring-1 ring-white">
                      {STATUS_LABEL[g.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[11px] text-stone-500">
                    {new Date(g.lastSeen).toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ExcludeButton hitId={g.primaryId} domain={g.primaryDomain} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Fade-Overlay über der letzten Zeile */}
        {!showAll && hasMore && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white/90 via-white/60 to-transparent" />
        )}
      </div>

      {hasMore && (
        <div className="relative flex justify-center border-t border-white/60 px-5 py-3">
          <button
            onClick={() => setShowAll(!showAll)}
            className="rounded-full bg-stone-900 px-6 py-2 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] transition hover:bg-stone-800"
          >
            {showAll
              ? "Weniger anzeigen"
              : `Alle ${groups.length} Ergebnisse anzeigen`}
          </button>
        </div>
      )}
    </section>
  );
}
