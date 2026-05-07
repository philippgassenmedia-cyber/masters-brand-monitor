"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Category =
  | "clear_violation"
  | "suspected_violation"
  | "borderline"
  | "generic_use"
  | "own_brand"
  | "other_industry"
  | "false_positive";

interface ReferenceCase {
  id: string;
  title: string;
  company_name: string | null;
  url: string | null;
  category: Category;
  score: number;
  reasoning: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  clear_violation: "Klare Verletzung",
  suspected_violation: "Verdacht",
  borderline: "Grenzwertig",
  generic_use: "Generische Nutzung",
  own_brand: "Eigene Marke",
  other_industry: "Andere Branche",
  false_positive: "Fehlalarm",
};

const CATEGORY_COLOR: Record<Category, string> = {
  clear_violation: "bg-rose-100 text-rose-800",
  suspected_violation: "bg-orange-100 text-orange-800",
  borderline: "bg-amber-100 text-amber-800",
  generic_use: "bg-stone-100 text-stone-700",
  own_brand: "bg-sky-100 text-sky-800",
  other_industry: "bg-stone-100 text-stone-600",
  false_positive: "bg-emerald-100 text-emerald-800",
};

function scoreBadge(score: number) {
  if (score >= 7) return "bg-rose-100 text-rose-900";
  if (score >= 4) return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-900";
}

const EMPTY_FORM = {
  title: "",
  company_name: "",
  url: "",
  category: "clear_violation" as Category,
  score: 8,
  reasoning: "",
  notes: "",
};

export function ReferenceCasesClient({ initialCases }: { initialCases: ReferenceCase[] }) {
  const router = useRouter();
  const [cases, setCases] = useState<ReferenceCase[]>(initialCases);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activeCount = cases.filter((c) => c.active).length;

  function handleChange(field: keyof typeof EMPTY_FORM, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function submit() {
    setError(null);
    startSaving(async () => {
      const res = await fetch("/api/reference-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          score: Number(form.score),
          company_name: form.company_name || null,
          url: form.url || null,
          reasoning: form.reasoning || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Fehler beim Speichern");
        return;
      }
      const created = await res.json();
      setCases((c) => [created, ...c]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    });
  }

  function toggleActive(id: string, current: boolean) {
    startDeleting(async () => {
      await fetch(`/api/reference-cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !current }),
      });
      setCases((c) => c.map((x) => (x.id === id ? { ...x, active: !current } : x)));
    });
  }

  function deleteCase(id: string) {
    if (!confirm("Referenzfall löschen?")) return;
    startDeleting(async () => {
      await fetch(`/api/reference-cases/${id}`, { method: "DELETE" });
      setCases((c) => c.filter((x) => x.id !== id));
      router.refresh();
    });
  }

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Referenzfälle</h1>
          <p className="mt-1 text-sm text-stone-500">
            Kuratierte Beispiele, die die KI bei der Bewertung neuer Treffer als Orientierung nutzt.
            {activeCount > 0 && (
              <span className="ml-2 font-medium text-stone-700">{activeCount} aktiv</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="shrink-0 rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 transition"
        >
          + Neuer Referenzfall
        </button>
      </div>

      {/* Info box */}
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <strong>Wie funktioniert das?</strong> Jeder aktive Referenzfall wird in den KI-Prompt injiziert und dient als Musterbeispiel.
          Füge typische Verletzungsfälle <em>und</em> Fehlalarme hinzu — die KI lernt aus beiden.
          Je präziser die Begründung, desto besser die Bewertungen.
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-6 glass p-6">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-stone-500">Neuer Referenzfall</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-600">Titel / Beschreibung *</label>
              <input
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="z. B. Master Homes Real Estate GmbH — klare Verletzung Immobilien"
                className="w-full rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Firmenname</label>
              <input
                value={form.company_name}
                onChange={(e) => handleChange("company_name", e.target.value)}
                placeholder="Master Homes Real Estate GmbH"
                className="w-full rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">URL (optional)</label>
              <input
                value={form.url}
                onChange={(e) => handleChange("url", e.target.value)}
                placeholder="https://master-homes.de"
                className="w-full rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Kategorie *</label>
              <select
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
                className="w-full rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              >
                {(Object.entries(CATEGORY_LABEL) as [Category, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600">Score (1–10) *</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form.score}
                  onChange={(e) => handleChange("score", parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${scoreBadge(form.score)}`}>
                  {form.score}
                </span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-600">Begründung</label>
              <textarea
                value={form.reasoning}
                onChange={(e) => handleChange("reasoning", e.target.value)}
                rows={3}
                placeholder="Warum ist das ein Verstoß / kein Verstoß? Was genau macht diese Firma? Welches Wort wird wie verwendet?"
                className="w-full rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/20 resize-y"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-stone-600">Anwaltshinweis (intern)</label>
              <textarea
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={2}
                placeholder="Interne Notizen, z. B. bereits abgemahnt, Vergleich erzielt, etc."
                className="w-full rounded-xl border border-white/70 bg-white/60 px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/20 resize-y"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={saving || !form.title}
              className="rounded-full bg-stone-900 px-6 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40 transition"
            >
              {saving ? "Wird gespeichert…" : "Speichern"}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Cases table */}
      {cases.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 py-16 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          <p className="text-sm text-stone-500">Noch keine Referenzfälle hinterlegt.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-1 text-sm font-semibold text-stone-900 underline underline-offset-2 hover:text-stone-600"
          >
            Ersten Referenzfall hinzufügen
          </button>
        </div>
      ) : (
        <section className="glass overflow-hidden">
          <div className="border-b border-white/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Alle Referenzfälle
              <span className="ml-2 text-stone-400 font-normal">· {cases.length}</span>
            </h2>
          </div>
          <div className="divide-y divide-white/50">
            {cases.map((c) => (
              <div key={c.id} className={`px-5 py-4 transition ${c.active ? "" : "opacity-50"}`}>
                <div className="flex items-start gap-4">
                  {/* Score badge */}
                  <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${scoreBadge(c.score)}`}>
                    {c.score}
                  </span>

                  {/* Main content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-stone-900">{c.title}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_COLOR[c.category]}`}>
                        {CATEGORY_LABEL[c.category]}
                      </span>
                      {!c.active && (
                        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                          Deaktiviert
                        </span>
                      )}
                    </div>

                    {c.company_name && (
                      <div className="mt-1 text-xs text-stone-500">Firma: {c.company_name}</div>
                    )}

                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-xs text-orange-700 hover:underline"
                      >
                        {c.url}
                      </a>
                    )}

                    {c.reasoning && (
                      <p className="mt-2 text-[13px] text-stone-700 line-clamp-2">{c.reasoning}</p>
                    )}

                    {c.notes && (
                      <p className="mt-1 text-[11px] text-stone-500 italic line-clamp-1">{c.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => toggleActive(c.id, c.active)}
                      disabled={deleting}
                      className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-stone-600 hover:border-stone-300 hover:bg-white transition disabled:opacity-40"
                    >
                      {c.active ? "Deaktivieren" : "Aktivieren"}
                    </button>
                    <button
                      onClick={() => deleteCase(c.id)}
                      disabled={deleting}
                      className="rounded-full border border-rose-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition disabled:opacity-40"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
