"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type HitStatus = "new" | "reviewing" | "confirmed" | "dismissed" | "sent_to_lawyer" | "resolved";

const STATUS_OPTIONS: { value: HitStatus; label: string }[] = [
  { value: "new", label: "Neu" },
  { value: "reviewing", label: "In Prüfung" },
  { value: "confirmed", label: "Bestätigt" },
  { value: "dismissed", label: "Verworfen" },
  { value: "sent_to_lawyer", label: "An Anwalt" },
  { value: "resolved", label: "Erledigt" },
];

export function StatusForm({
  hitId,
  domain,
  initialStatus,
  initialNotes,
}: {
  hitId: string;
  domain: string;
  initialStatus: HitStatus;
  initialNotes: string | null;
}) {
  const [status, setStatus] = useState<HitStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/hits/${hitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
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

  const markAsOwn = () => {
    if (
      !confirm(
        `Domain "${domain}" als eigene Marke markieren?\n\nAlle bestehenden und zukünftigen Treffer dieser Domain werden entfernt.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await fetch(`/api/hits/${hitId}/exclude`, { method: "POST" });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Fehler beim Ausschließen.");
      }
    });
  };

  return (
    <section className="glass p-6">
      <h2 className="mb-4 text-lg font-semibold text-stone-900">Workflow</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Status dropdown */}
        <div>
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
            Status
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as HitStatus)}
            disabled={pending}
            className="h-12 w-full appearance-none rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md outline-none transition focus:border-stone-400 focus:bg-white/90 disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Current status pill */}
        <div className="flex items-end">
          <span className="rounded-full bg-orange-50/70 px-4 py-2.5 text-xs font-semibold text-stone-700 ring-1 ring-white/80">
            {STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}
          </span>
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4">
        <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
          Notizen
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Interne Notizen, Hinweise für den Anwalt…"
          disabled={pending}
          className="w-full rounded-2xl border border-white/80 bg-orange-50/70 px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md outline-none transition focus:border-stone-400 focus:bg-white/90 disabled:opacity-60"
        />
      </div>

      {/* Feedback */}
      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-xs text-emerald-800">
          Gespeichert
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="h-10 rounded-full bg-stone-900 px-6 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Speichern"}
        </button>
        <button
          onClick={markAsOwn}
          disabled={pending}
          className="h-10 rounded-full border border-stone-300 bg-white/60 px-6 text-xs font-semibold text-stone-700 hover:bg-white/90 disabled:opacity-60"
        >
          Als eigene Marke markieren
        </button>
      </div>
    </section>
  );
}
