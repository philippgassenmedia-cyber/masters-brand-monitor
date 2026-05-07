"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type WorkflowStatus = "new" | "reviewing" | "confirmed" | "dismissed" | "sent_to_lawyer" | "resolved";

const STATUS_OPTIONS: { value: WorkflowStatus; label: string }[] = [
  { value: "new", label: "Offen" },
  { value: "reviewing", label: "In Prüfung" },
  { value: "confirmed", label: "Bestätigt" },
  { value: "dismissed", label: "Verworfen" },
  { value: "sent_to_lawyer", label: "An Anwalt" },
  { value: "resolved", label: "Erledigt" },
];

export function TrademarkStatusForm({
  trademarkId,
  initialStatus,
  initialNotes,
}: {
  trademarkId: string;
  initialStatus: WorkflowStatus;
  initialNotes: string | null;
}) {
  const [status, setStatus] = useState<WorkflowStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/trademarks/${trademarkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_status: status, notes }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        setError("Speichern fehlgeschlagen.");
      }
    });
  };

  return (
    <section className="glass p-6">
      <h2 className="mb-4 text-lg font-semibold text-stone-900">Workflow</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">Status</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
            disabled={pending}
            className="h-12 w-full appearance-none rounded-full border border-white/80 bg-violet-50/70 px-4 text-sm text-stone-800 shadow-[0_2px_12px_rgba(100,60,120,0.06)] backdrop-blur-md outline-none transition focus:border-stone-400 focus:bg-white/90 disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <span className="rounded-full bg-violet-50/70 px-4 py-2.5 text-xs font-semibold text-stone-700 ring-1 ring-white/80">
            {STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">Notizen</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Interne Notizen, Hinweise für den Anwalt…"
          disabled={pending}
          className="w-full rounded-2xl border border-white/80 bg-violet-50/70 px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 shadow-[0_2px_12px_rgba(100,60,120,0.06)] backdrop-blur-md outline-none transition focus:border-stone-400 focus:bg-white/90 disabled:opacity-60"
        />
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2 text-xs text-rose-800">{error}</div>
      )}
      {saved && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-xs text-emerald-800">Gespeichert</div>
      )}

      <div className="mt-5">
        <button
          onClick={save}
          disabled={pending}
          className="h-10 rounded-full bg-stone-900 px-6 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Speichern"}
        </button>
      </div>
    </section>
  );
}
