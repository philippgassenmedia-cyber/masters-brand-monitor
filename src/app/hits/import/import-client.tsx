"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";

type HitStatus = "new" | "reviewing" | "confirmed" | "dismissed" | "sent_to_lawyer" | "resolved";
type ViolationCategory =
  | "clear_violation"
  | "suspected_violation"
  | "borderline"
  | "generic_use"
  | "own_brand"
  | "other_industry"
  | "not_relevant";

interface ImportHit {
  company_name: string;
  url: string | null;
  title: string | null;
  snippet: string | null;
  address: string | null;
  ai_score: number | null;
  ai_reasoning: string | null;
  status: HitStatus;
  notes: string | null;
  violation_category: ViolationCategory | null;
}

const STATUS_LABELS: Record<HitStatus, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

const STATUS_COLORS: Record<HitStatus, string> = {
  new: "bg-stone-100 text-stone-600",
  reviewing: "bg-amber-100 text-amber-700",
  confirmed: "bg-rose-100 text-rose-700",
  dismissed: "bg-emerald-100 text-emerald-700",
  sent_to_lawyer: "bg-purple-100 text-purple-700",
  resolved: "bg-sky-100 text-sky-700",
};

const CAT_LABELS: Record<ViolationCategory, string> = {
  clear_violation: "Klare Verletzung",
  suspected_violation: "Verdacht",
  borderline: "Grenzfall",
  generic_use: "Generisch",
  own_brand: "Eigene Marke",
  other_industry: "Andere Branche",
  not_relevant: "Nicht relevant",
};

const EMPTY: ImportHit = {
  company_name: "",
  url: null,
  title: null,
  snippet: null,
  address: null,
  ai_score: null,
  ai_reasoning: null,
  status: "new",
  notes: null,
  violation_category: null,
};

export function ImportClient() {
  const [tab, setTab] = useState<"manual" | "pdf">("pdf");

  // ── Manual form ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<ImportHit>({ ...EMPTY });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const setField = <K extends keyof ImportHit>(k: K, v: ImportHit[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submitManual = async () => {
    if (!form.company_name.trim()) return;
    setManualLoading(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/hits/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([form]),
      });
      const data = await res.json();
      if (data.inserted > 0) {
        setManualResult({ ok: true, msg: "Treffer erfolgreich importiert." });
        setForm({ ...EMPTY });
      } else if (data.skipped > 0) {
        setManualResult({ ok: false, msg: "Dieser Treffer existiert bereits (URL doppelt)." });
      } else {
        setManualResult({ ok: false, msg: data.errors?.[0] ?? "Unbekannter Fehler." });
      }
    } catch {
      setManualResult({ ok: false, msg: "Netzwerkfehler." });
    } finally {
      setManualLoading(false);
    }
  };

  // ── PDF upload ───────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportHit[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ inserted: number; skipped: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setPdfFile(f);
    setPreview(null);
    setExtractError(null);
    setConfirmResult(null);
  };

  const extractPdf = useCallback(async () => {
    if (!pdfFile) return;
    setExtracting(true);
    setExtractError(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", pdfFile);
      const res = await fetch("/api/hits/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setExtractError(data.error ?? "Extraktion fehlgeschlagen."); return; }
      setPreview(data.hits ?? []);
    } catch {
      setExtractError("Netzwerkfehler.");
    } finally {
      setExtracting(false);
    }
  }, [pdfFile]);

  const updatePreview = (i: number, k: keyof ImportHit, v: string | number | null) =>
    setPreview((p) => p ? p.map((h, idx) => idx === i ? { ...h, [k]: v } : h) : p);

  const confirmImport = async () => {
    if (!preview?.length) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/hits/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });
      const data = await res.json();
      setConfirmResult({ inserted: data.inserted ?? 0, skipped: data.skipped ?? 0 });
      setPreview(null);
      setPdfFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setExtractError("Netzwerkfehler beim Import.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-stone-900">Treffer importieren</h1>
          <p className="text-xs text-stone-500">
            Manuelle Eingabe oder PDF-Bericht eines anderen Dienstleisters hochladen
          </p>
        </div>
        <Link href="/hits" className="text-xs text-stone-500 hover:text-stone-800">← Alle Treffer</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/70 bg-white/40 p-1">
        {(["pdf", "manual"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
              tab === t ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:bg-white/60"
            }`}
          >
            {t === "pdf" ? "PDF-Upload" : "Manuell"}
          </button>
        ))}
      </div>

      {/* ── PDF-Tab ─────────────────────────────────────────────────────────── */}
      {tab === "pdf" && (
        <div className="glass space-y-4 rounded-2xl p-5">
          <p className="text-xs text-stone-500">
            Lade einen Bericht als PDF hoch. Die KI extrahiert automatisch alle Treffer inklusive
            Status und Begründungen. Du kannst die Daten vor dem Import noch anpassen.
          </p>

          {/* Drop zone */}
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-stone-200 bg-white/40 px-6 py-8 text-center transition hover:border-stone-400 hover:bg-white/70">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div>
              <p className="text-sm font-medium text-stone-700">
                {pdfFile ? pdfFile.name : "PDF-Datei auswählen"}
              </p>
              <p className="text-xs text-stone-400">{pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB` : "max. 15 MB"}</p>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="sr-only" onChange={handleFileChange} />
          </label>

          {pdfFile && !preview && !confirmResult && (
            <button
              onClick={extractPdf}
              disabled={extracting}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
            >
              {extracting ? "KI analysiert PDF…" : "Treffer extrahieren"}
            </button>
          )}

          {extractError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {extractError}
            </div>
          )}

          {confirmResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <strong>{confirmResult.inserted} Treffer importiert</strong>
              {confirmResult.skipped > 0 && ` · ${confirmResult.skipped} bereits vorhanden übersprungen`}
              {" — "}
              <Link href="/hits" className="underline">Alle Treffer ansehen</Link>
            </div>
          )}

          {/* Preview table */}
          {preview && preview.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Keine Treffer im PDF gefunden. Bitte prüfe ob das PDF Marken-Trefferdaten enthält.
            </div>
          )}

          {preview && preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-700">
                  {preview.length} Treffer gefunden — bitte prüfen und anpassen:
                </p>
                <button
                  onClick={confirmImport}
                  disabled={confirming}
                  className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
                >
                  {confirming ? "Importiere…" : `${preview.length} Treffer importieren`}
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/70">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50/80 text-left text-[10px] uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Firma</th>
                      <th className="px-3 py-2 font-semibold hidden md:table-cell">URL</th>
                      <th className="px-3 py-2 font-semibold">Score</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold hidden lg:table-cell">Notiz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((h, i) => (
                      <tr key={i} className="border-t border-white/50">
                        <td className="px-3 py-2">
                          <input
                            className="w-full min-w-[120px] rounded border border-stone-200 bg-white/60 px-2 py-1 text-xs"
                            value={h.company_name}
                            onChange={(e) => updatePreview(i, "company_name", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <input
                            className="w-full min-w-[160px] rounded border border-stone-200 bg-white/60 px-2 py-1 text-xs text-stone-500"
                            value={h.url ?? ""}
                            placeholder="https://…"
                            onChange={(e) => updatePreview(i, "url", e.target.value || null)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-14 rounded border border-stone-200 bg-white/60 px-2 py-1 text-xs"
                            value={h.ai_score ?? ""}
                            placeholder="—"
                            onChange={(e) => updatePreview(i, "ai_score", e.target.value ? Number(e.target.value) : null)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded border border-stone-200 bg-white/60 px-2 py-1 text-xs"
                            value={h.status}
                            onChange={(e) => updatePreview(i, "status", e.target.value as HitStatus)}
                          >
                            {Object.entries(STATUS_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell">
                          <input
                            className="w-full min-w-[140px] rounded border border-stone-200 bg-white/60 px-2 py-1 text-xs text-stone-500"
                            value={h.notes ?? ""}
                            placeholder="Notiz…"
                            onChange={(e) => updatePreview(i, "notes", e.target.value || null)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={confirmImport}
                disabled={confirming}
                className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
              >
                {confirming ? "Importiere…" : `${preview.length} Treffer importieren`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Manuell-Tab ─────────────────────────────────────────────────────── */}
      {tab === "manual" && (
        <div className="glass rounded-2xl p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-stone-700">
                Firmenname <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                placeholder="Master Immobilien Frankfurt GmbH"
                value={form.company_name}
                onChange={(e) => setField("company_name", e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-stone-700">URL</label>
              <input
                type="url"
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                placeholder="https://www.beispiel.de"
                value={form.url ?? ""}
                onChange={(e) => setField("url", e.target.value || null)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Adresse</label>
              <input
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                placeholder="67346 Speyer"
                value={form.address ?? ""}
                onChange={(e) => setField("address", e.target.value || null)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Score (1–10)</label>
              <input
                type="number"
                min={1}
                max={10}
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                placeholder="—"
                value={form.ai_score ?? ""}
                onChange={(e) => setField("ai_score", e.target.value ? Number(e.target.value) : null)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Status</label>
              <select
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => setField("status", e.target.value as HitStatus)}
              >
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-700">Kategorie</label>
              <select
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                value={form.violation_category ?? ""}
                onChange={(e) => setField("violation_category", (e.target.value || null) as ViolationCategory | null)}
              >
                <option value="">— auswählen —</option>
                {Object.entries(CAT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-stone-700">Kontext / Snippet</label>
              <textarea
                rows={2}
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                placeholder="Kurze Beschreibung der Fundstelle…"
                value={form.snippet ?? ""}
                onChange={(e) => setField("snippet", e.target.value || null)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-stone-700">Begründung / Notizen</label>
              <textarea
                rows={3}
                className="w-full rounded-xl border border-stone-200 bg-white/60 px-3 py-2 text-sm"
                placeholder="Entscheidungsbegründung des Erstellers…"
                value={form.notes ?? ""}
                onChange={(e) => setField("notes", e.target.value || null)}
              />
            </div>
          </div>

          <button
            onClick={submitManual}
            disabled={manualLoading || !form.company_name.trim()}
            className="mt-5 w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            {manualLoading ? "Wird gespeichert…" : "Treffer importieren"}
          </button>

          {manualResult && (
            <div className={`mt-3 rounded-xl border px-4 py-2 text-xs ${manualResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
              {manualResult.msg}
              {manualResult.ok && (
                <> · <Link href="/hits" className="underline">Alle Treffer ansehen</Link></>
              )}
            </div>
          )}

          {/* Status + Kategorie Legende */}
          <div className="mt-6 border-t border-white/60 pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Status-Legende</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <span key={v} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[v as HitStatus]}`}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
