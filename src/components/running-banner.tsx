"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  newHits: number;
  startedAt: string;
  region: string | null;
}

export function RunningBanner({ newHits, startedAt, region }: Props) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [router]);

  const elapsed = Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000);

  return (
    <div className="mb-6 flex items-center gap-4 rounded-2xl border border-emerald-200/60 bg-emerald-50/80 px-5 py-4 shadow-sm backdrop-blur">
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-900">
          Scan läuft im Hintergrund
        </p>
        <p className="text-xs text-emerald-700">
          {newHits} neue Treffer bisher · Region{" "}
          <span className="font-medium">{region ?? "—"}</span> · seit {elapsed} Min.
          · Seite aktualisiert sich automatisch
        </p>
      </div>
      <Link
        href="/scan"
        className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-800"
      >
        Live öffnen →
      </Link>
    </div>
  );
}
