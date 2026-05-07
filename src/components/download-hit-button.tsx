"use client";

import { useState } from "react";

export function DownloadHitButton({ hitId }: { hitId: string }) {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hits/${hitId}/download`);
      if (!res.ok) { alert("Download fehlgeschlagen."); return; }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `treffer-${hitId.slice(0, 8)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-stone-600 hover:border-stone-300 hover:bg-white hover:text-stone-900 disabled:opacity-40 transition"
      title="Auszug als PDF herunterladen"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      {loading ? "…" : "PDF"}
    </button>
  );
}
