"use client";

import { useEffect, useState } from "react";

interface Stats {
  missing: number;
  total: number;
}

type Phase = "idle" | "running" | "done" | "error";

export function EnrichHitsButton() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [processed, setProcessed] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hits/enrich")
      .then((r) => r.json())
      .then((d: Stats) => {
        setStats(d);
        setRemaining(d.missing);
      })
      .catch(() => {});
  }, []);

  const start = async (force = false) => {
    setPhase("running");
    setError(null);
    setProcessed(0);
    setUpdated(0);

    let rem = force ? (stats?.total ?? 0) : (stats?.missing ?? 0);
    setRemaining(rem);

    while (rem > 0) {
      try {
        const res = await fetch("/api/hits/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: 20, force }),
        });
        if (!res.ok) throw new Error(await res.text());
        const d = await res.json();

        if (d.processed === 0) break;
        setProcessed((p) => p + d.processed);
        setUpdated((u) => u + d.updated);
        setRemaining(d.remaining);
        rem = d.remaining;
      } catch (e) {
        setError((e as Error).message);
        setPhase("error");
        return;
      }
    }

    // Refresh stats
    const d = await fetch("/api/hits/enrich").then((r) => r.json()).catch(() => null);
    if (d) setStats(d);
    setPhase("done");
  };

  if (!stats) return null;

  const pct = stats.total > 0
    ? Math.round(((stats.total - remaining) / stats.total) * 100)
    : 100;

  return (
    <div className="flex flex-col gap-2">
      {phase === "idle" && (
        <div className="flex items-center gap-2 flex-wrap">
          {stats.missing > 0 ? (
            <button
              onClick={() => start(false)}
              className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition"
            >
              KI-Anreicherung starten ({stats.missing} Treffer)
            </button>
          ) : (
            <span className="text-xs text-emerald-700 font-medium">
              ✓ Alle Treffer angereichert
            </span>
          )}
          <button
            onClick={() => start(true)}
            className="rounded-full border border-stone-200 bg-white/70 px-4 py-1.5 text-xs font-semibold text-stone-600 hover:bg-white/90 transition"
          >
            Alle neu analysieren ({stats.total})
          </button>
        </div>
      )}

      {phase === "running" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-stone-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-stone-900" />
            </span>
            <span className="text-xs text-stone-700">
              KI analysiert… {processed} verarbeitet · {updated} aktualisiert · {remaining} ausstehend
            </span>
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-stone-900 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-700 font-medium">
            ✓ Fertig — {updated} Treffer mit KI-Daten angereichert
          </span>
          <button
            onClick={() => setPhase("idle")}
            className="text-[10px] text-stone-400 hover:text-stone-700"
          >
            Zurücksetzen
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-rose-600">{error}</span>
          <button
            onClick={() => setPhase("idle")}
            className="text-[10px] text-stone-400 hover:text-stone-700"
          >
            Wiederholen
          </button>
        </div>
      )}
    </div>
  );
}
