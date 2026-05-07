"use client";

import { useState, useTransition } from "react";

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

interface Hit {
  id: string;
  company_name: string | null;
  domain: string | null;
  url: string;
  ai_score: number | null;
  violation_category: string | null;
  ai_reasoning: string | null;
  status: string;
  title: string | null;
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

const STATUS_LABEL: Record<string, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

function scoreBadge(score: number | null) {
  if (score === null) return "bg-stone-200 text-stone-600";
  if (score >= 7) return "bg-rose-100 text-rose-900";
  if (score >= 4) return "bg-amber-100 text-amber-900";
  return "bg-emerald-100 text-emerald-900";
}

function mapCategory(cat: string | null): Category {
  const valid: Category[] = ["clear_violation", "suspected_violation", "borderline", "generic_use", "own_brand", "other_industry"];
  if (cat && valid.includes(cat as Category)) return cat as Category;
  return "suspected_violation";
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

export function ReferenceCasesClient({
  initialCases,
  allHits,
}: {
  initialCases: ReferenceCase[];
  allHits: Hit[];
}) {
  const [tab, setTab] = useState<"cases" | "hits">("cases");
  const [cases, setCases] = useState<ReferenceCase[]>(initialCases);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, startSaving] = useTransition();
  const [acting, startActing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hitSearch, setHitSearch] = useState("");

  // IDs already used as reference cases (by URL match)
  const usedUrls = new Set(cases.map((c) => c.url).filter(Boolean));

  const filteredHits = allHits.filter((h) => {
    const q = hitSearch.toLowerCase();
    if (!q) return true;
    return (
      h.company_name?.toLowerCase().includes(q) ||
      h.domain?.toLowerCase().includes(q) ||
      h.url.toLowerCase().includes(q) ||
      h.title?.toLowerCase().includes(q)
    );
  });

  function handleChange(field: keyof typeof EMPTY_FORM, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openFromHit(hit: Hit) {
    setForm({
      title: hit.company_name ?? hit.domain ?? hit.title ?? "",
      company_name: hit.company_name ?? "",
      url: hit.url ?? "",
      category: mapCategory(hit.violation_category),
      score: hit.ai_score ?? 5,
      reasoning: hit.ai_reasoning ?? "",
      notes: "",
    });
    setError(null);
    setShowForm(true);
    setTab("cases");
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
    startActing(async () => {
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
    startActing(async () => {
      await fetch(`/api/reference-cases/${id}`, { method: "DELETE" });
      setCases((c) => c.filter((x) => x.id !== id));
    });
  }

  const activeCount = cases.filter((c) => c.active).length;

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
          onClick={() => { setForm(EMPTY_FORM); setError(null); setShowForm(true); setTab("cases"); }}
          className="shrink-0 rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 transition"
        >
          + Neuer Referenzfall
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-2xl bg-stone-100/70 p-1 w-fit">
        {([["cases", `Referenzfälle (${cases.length})`], ["hits", `Aus Treffern wählen (${allHits.length})`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
              tab === key
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Referenzfälle ── */}
      {tab === "cases" && (
        <>
          {/* Info box */}
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <strong>Wie funktioniert das?</strong> Jeder aktive Referenzfall wird in den KI-Prompt injiziert.
              Füge typische Verletzungen <em>und</em> Fehlalarme hinzu — die KI lernt aus beiden.
              Über den Tab <strong>„Aus Treffern wählen"</strong> kannst du bestehende Treffer direkt übernehmen.
            </div>
          </div>

          {/* Add form */}
          {showForm && (
            <div className="mb-6 glass p-6">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-stone-500">
                {form.url || form.company_name ? "Treffer als Referenzfall speichern" : "Neuer Referenzfall"}
              </h2>
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
                    placeholder="Warum ist das ein Verstoß / kein Verstoß?"
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

          {/* Cases list */}
          {cases.length === 0 ? (
            <div className="glass flex flex-col items-center gap-3 py-16 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <p className="text-sm text-stone-500">Noch keine Referenzfälle hinterlegt.</p>
              <button
                onClick={() => { setTab("hits"); }}
                className="mt-1 text-sm font-semibold text-stone-900 underline underline-offset-2 hover:text-stone-600"
              >
                Aus Treffern auswählen
              </button>
            </div>
          ) : (
            <section className="glass overflow-hidden">
              <div className="border-b border-white/60 px-5 py-3">
                <h2 className="text-sm font-semibold text-stone-900">
                  Alle Referenzfälle
                  <span className="ml-2 font-normal text-stone-400">· {cases.length}</span>
                </h2>
              </div>
              <div className="divide-y divide-white/50">
                {cases.map((c) => (
                  <div key={c.id} className={`px-5 py-4 transition ${c.active ? "" : "opacity-50"}`}>
                    <div className="flex items-start gap-4">
                      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${scoreBadge(c.score)}`}>
                        {c.score}
                      </span>
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
                        {c.company_name && <div className="mt-1 text-xs text-stone-500">Firma: {c.company_name}</div>}
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-xs text-orange-700 hover:underline">
                            {c.url}
                          </a>
                        )}
                        {c.reasoning && <p className="mt-2 line-clamp-2 text-[13px] text-stone-700">{c.reasoning}</p>}
                        {c.notes && <p className="mt-1 line-clamp-1 text-[11px] italic text-stone-500">{c.notes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => toggleActive(c.id, c.active)}
                          disabled={acting}
                          className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-stone-600 hover:border-stone-300 hover:bg-white transition disabled:opacity-40"
                        >
                          {c.active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button
                          onClick={() => deleteCase(c.id)}
                          disabled={acting}
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
        </>
      )}

      {/* ── Tab: Aus Treffern wählen ── */}
      {tab === "hits" && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
              </svg>
              <input
                value={hitSearch}
                onChange={(e) => setHitSearch(e.target.value)}
                placeholder="Suche nach Firma, Domain…"
                className="w-full rounded-xl border border-white/70 bg-white/60 py-2.5 pl-9 pr-4 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
              />
            </div>
            <span className="text-sm text-stone-500">{filteredHits.length} Treffer</span>
          </div>

          <section className="glass overflow-hidden">
            <div className="border-b border-white/60 px-5 py-3">
              <h2 className="text-sm font-semibold text-stone-900">Bestehende Treffer</h2>
            </div>
            {filteredHits.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-stone-500">Keine Treffer gefunden.</p>
            ) : (
              <div className="divide-y divide-white/50">
                {filteredHits.map((h) => {
                  const alreadyAdded = usedUrls.has(h.url);
                  return (
                    <div key={h.id} className="flex items-center gap-4 px-5 py-3">
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${scoreBadge(h.ai_score)}`}>
                        {h.ai_score ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-stone-900 truncate">
                            {h.company_name ?? h.domain ?? h.title ?? "—"}
                          </span>
                          {h.violation_category && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_COLOR[mapCategory(h.violation_category)]}`}>
                              {CATEGORY_LABEL[mapCategory(h.violation_category)]}
                            </span>
                          )}
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">
                            {STATUS_LABEL[h.status] ?? h.status}
                          </span>
                        </div>
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 block truncate text-[11px] text-orange-700 hover:underline"
                        >
                          {h.url}
                        </a>
                      </div>
                      <button
                        onClick={() => openFromHit(h)}
                        disabled={alreadyAdded}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                          alreadyAdded
                            ? "border-stone-200 bg-stone-50 text-stone-400 cursor-not-allowed"
                            : "border-stone-900 bg-stone-900 text-white hover:bg-stone-700"
                        }`}
                      >
                        {alreadyAdded ? "Bereits hinzugefügt" : "Als Referenz hinzufügen"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
