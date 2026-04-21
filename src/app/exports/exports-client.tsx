"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const LAWYER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  exported: { label: "Exportiert", color: "bg-stone-100 text-stone-700" },
  sent_to_lawyer: { label: "An Anwalt", color: "bg-amber-100 text-amber-900" },
  warned: { label: "Angemahnt", color: "bg-orange-100 text-orange-900" },
  cease_desist: { label: "Abmahnung", color: "bg-rose-100 text-rose-900" },
  lawsuit: { label: "Klage", color: "bg-red-100 text-red-900" },
  settled: { label: "Beigelegt", color: "bg-emerald-100 text-emerald-900" },
  dismissed: { label: "Verworfen", color: "bg-stone-100 text-stone-500" },
};

interface ExportRow {
  id: string;
  exported_at: string;
  format: string;
  hit_count: number;
  trademark_count: number;
  exported_by: string | null;
}

interface ExportItem {
  id: string;
  export_id: string;
  item_type: string;
  item_id: string;
  lawyer_status: string;
  lawyer_notes: string | null;
  hit_company?: string | null;
  hit_domain?: string | null;
  hit_score?: number | null;
  tm_markenname?: string | null;
  tm_aktenzeichen?: string | null;
  tm_score?: number | null;
}

export function ExportsClient({
  exports,
  items,
}: {
  exports: ExportRow[];
  items: ExportItem[];
}) {
  const [selectedExport, setSelectedExport] = useState<string | null>(
    exports[0]?.id ?? null,
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const selectedItems = items.filter((i) => i.export_id === selectedExport);

  const updateItemStatus = (itemId: string, status: string) => {
    startTransition(async () => {
      await fetch("/api/lawyer-export/item-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, status }),
      });
      router.refresh();
    });
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Anwalts-Exporte</h1>
          <p className="mt-1 text-sm text-stone-600">
            Exportierte Verletzungsfälle mit Status-Tracking.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/lawyer-export?format=csv"
            className="flex h-10 items-center rounded-full bg-stone-900 px-5 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800"
          >
            Neuer Export (CSV)
          </a>
          <a
            href="/api/lawyer-export?format=pdf"
            className="flex h-10 items-center rounded-full border border-white/80 bg-white/60 px-5 text-xs font-semibold text-stone-700 hover:bg-white/90"
          >
            Neuer Export (PDF)
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Export-Historie links */}
        <section className="glass p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-600">
            Export-Historie
          </h2>
          <div className="space-y-2">
            {exports.length === 0 && (
              <div className="py-8 text-center text-xs text-stone-500">
                Noch keine Exporte. Klicke oben auf „Neuer Export".
              </div>
            )}
            {exports.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedExport(e.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  selectedExport === e.id
                    ? "border-stone-300 bg-stone-900 text-white"
                    : "border-white/70 bg-white/60 text-stone-800 hover:bg-white/90"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    {new Date(e.exported_at).toLocaleDateString("de-DE")}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                      selectedExport === e.id
                        ? "bg-white/20 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {e.format}
                  </span>
                </div>
                <div className={`mt-1 text-[11px] ${selectedExport === e.id ? "text-white/70" : "text-stone-500"}`}>
                  {e.hit_count} Web · {e.trademark_count} DPMA
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Items des ausgewählten Exports */}
        <section className="glass overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Exportierte Fälle
              <span className="ml-2 text-stone-500">· {selectedItems.length}</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Quelle</th>
                  <th className="px-5 py-3 font-semibold">Score</th>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {selectedItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-stone-500">
                      {selectedExport ? "Keine Einträge in diesem Export." : "Wähle einen Export links."}
                    </td>
                  </tr>
                )}
                {selectedItems.map((item) => {
                  const isHit = item.item_type === "hit";
                  const name = isHit
                    ? item.hit_company ?? item.hit_domain ?? "—"
                    : item.tm_markenname ?? "—";
                  const score = isHit ? item.hit_score : item.tm_score;
                  const statusInfo = LAWYER_STATUS_LABELS[item.lawyer_status] ?? LAWYER_STATUS_LABELS.exported;
                  const detailHref = isHit
                    ? `/hits/${item.item_id}`
                    : `/trademarks/${item.item_id}`;

                  return (
                    <tr key={item.id} className="border-t border-white/50 hover:bg-white/50">
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isHit ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}`}>
                          {isHit ? "Web" : "DPMA"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                            (score ?? 0) >= 7 ? "bg-rose-100 text-rose-900" : (score ?? 0) >= 4 ? "bg-amber-100 text-amber-900" : "bg-stone-200/70 text-stone-700"
                          }`}
                        >
                          {score ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={detailHref} className="font-semibold text-stone-900 hover:text-stone-600">
                          {name}
                        </Link>
                        {!isHit && item.tm_aktenzeichen && (
                          <div className="text-[11px] text-stone-500">{item.tm_aktenzeichen}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={item.lawyer_status}
                          onChange={(e) => updateItemStatus(item.id, e.target.value)}
                          disabled={pending}
                          className="h-8 rounded-full border border-white/80 bg-orange-50/70 px-3 text-[11px] text-stone-800 outline-none disabled:opacity-60"
                        >
                          {Object.entries(LAWYER_STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
