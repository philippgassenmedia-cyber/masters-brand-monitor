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
  const [tab, setTab] = useState<"pdf" | "manual">("pdf");

  // ── Review queue (after PDF extraction) ─────────────────────────────────────
  const [queue, setQueue] = useState<ImportHit[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const queueActive = queue.length > 0 && queueIdx < queue.length;
  const queueDone = queue.length > 0 && queueIdx >= queue.length;

  // ── Manual form ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<ImportHit>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [manualResult, setManualResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const setField = <K extends keyof ImportHit>(k: K, v: ImportHit[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Load next queued hit into the form
  const loadFromQueue = useCallback((hits: ImportHit[], idx: number) => {
    if (idx < hits.length) {
      setForm({ ...hits[idx] });
      setManualResult(null);
    }
  }, []);

  const submitManual = async () => {
    if (!form.company_name.trim()) return;
    setSaving(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/hits/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ ...form, attachment_url: queueActive ? attachmentPath : null }]),
      });
      const data = await res.json();
      if (data.inserted > 0) {
        if (queueActive) {
          setImported((n) => n + 1);
          const next = queueIdx + 1;
          setQueueIdx(next);
          loadFromQueue(queue, next);
          if (next >= queue.length) setForm({ ...EMPTY });
        } else {
          setManualResult({ ok: true, msg: "Treffer erfolgreich importiert." });
          setForm({ ...EMPTY });
        }
      } else if (data.skipped > 0) {
        if (queueActive) {
          setManualResult({ ok: false, msg: "Bereits vorhanden — übersprungen oder manuell anpassen." });
        } else {
          setManualResult({ ok: false, msg: "Dieser Treffer existiert bereits (URL doppelt)." });
        }
      } else {
        setManualResult({ ok: false, msg: data.errors?.[0] ?? "Unbekannter Fehler." });
      }
    } catch {
      setManualResult({ ok: false, msg: "Netzwerkfehler." });
    } finally {
      setSaving(false);
    }
  };

  const skipCurrent = () => {
    setSkipped((n) => n + 1);
    const next = queueIdx + 1;
    setQueueIdx(next);
    loadFromQueue(queue, next);
    if (next >= queue.length) setForm({ ...EMPTY });
    setManualResult(null);
  };

  const resetQueue = () => {
    setQueue([]);
    setQueueIdx(0);
    setImported(0);
    setSkipped(0);
    setAttachmentPath(null);
    setForm({ ...EMPTY });
    setManualResult(null);
    setTab("pdf");
  };

  // ── PDF upload ───────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setPdfFile(f);
    setExtractError(null);
  };

  const extractPdf = useCallback(async () => {
    if (!pdfFile) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const fd = new FormData();
      fd.append("file", pdfFile);
      const res = await fetch("/api/hits/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error ?? "Extraktion fehlgeschlagen.");
        return;
      }
      const hits: ImportHit[] = data.hits ?? [];
      if (hits.length === 0) {
        setExtractError("Keine Treffer im PDF gefunden. Bitte prüfe ob das PDF Marken-Trefferdaten enthält.");
        return;
      }
      setQueue(hits);
      setQueueIdx(0);
      setImported(0);
      setSkipped(0);
      setAttachmentPath(data.attachmentPath ?? null);
      loadFromQueue(hits, 0);
      setManualResult(null);
      setTab("manual");
    } catch {
      setExtractError("Netzwerkfehler.");
    } finally {
      setExtracting(false);
    }
  }, [pdfFile, loadFromQueue]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-stone-900">Treffer importieren</h1>
          <p className="text-xs text-stone-500">
            Manuelle Eingabe oder PDF-Bericht eines anderen Dienstleisters hochladen
          </p>
        </div>
        <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">← Übersicht</Link>
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
            Lade einen Bericht als PDF hoch. Die KI extrahiert alle Treffer und öffnet sie zur
            manuellen Prüfung — Treffer für Treffer, mit vorausgefülltem Formular.
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

          {pdfFile && (
            <button
              onClick={extractPdf}
              disabled={extracting}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
            >
              {extracting ? "KI analysiert PDF…" : "Treffer extrahieren & prüfen"}
            </button>
          )}

          {extractError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {extractError}
            </div>
          )}
        </div>
      )}

      {/* ── Manuell-Tab ─────────────────────────────────────────────────────── */}
      {tab === "manual" && (
        <div className="glass rounded-2xl p-5">

          {/* Queue progress banner */}
          {queueDone && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-sm text-emerald-800">
                <strong>Alle {queue.length} Treffer geprüft.</strong>
                {" "}{imported} importiert · {skipped} übersprungen
                {" — "}
                <Link href="/" className="underline">Zur Übersicht</Link>
              </div>
              <button onClick={resetQueue} className="text-xs text-emerald-700 underline hover:text-emerald-900">
                Neues PDF
              </button>
            </div>
          )}

          {queueActive && (
            <div className="mb-5 space-y-2">
              {/* Progress */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  KI-Vorschlag · Treffer {queueIdx + 1} von {queue.length}
                </span>
                <button onClick={resetQueue} className="text-[11px] text-stone-400 hover:text-stone-600 underline">
                  Abbrechen
                </button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-stone-900 transition-all"
                  style={{ width: `${(queueIdx / queue.length) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-500">
                  Felder wurden von der KI vorausgefüllt. Bitte prüfen, ggf. anpassen und bestätigen.
                </p>
                {attachmentPath && (
                  <a
                    href={`/api/hits/import/preview-pdf?path=${encodeURIComponent(attachmentPath)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-orange-700 hover:underline"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    PDF ansehen
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Form */}
          {!queueDone && (
            <>
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

              {manualResult && (
                <div className={`mt-3 rounded-xl border px-4 py-2 text-xs ${manualResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {manualResult.msg}
                  {manualResult.ok && !queueActive && (
                    <> · <Link href="/" className="underline">Alle Treffer ansehen</Link></>
                  )}
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  onClick={submitManual}
                  disabled={saving || !form.company_name.trim()}
                  className="flex-1 rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
                >
                  {saving
                    ? "Wird gespeichert…"
                    : queueActive
                    ? `Bestätigen${queueIdx + 1 < queue.length ? " & weiter" : " & abschließen"}`
                    : "Treffer importieren"}
                </button>
                {queueActive && (
                  <button
                    onClick={skipCurrent}
                    disabled={saving}
                    className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition disabled:opacity-50"
                  >
                    Überspringen
                  </button>
                )}
              </div>
            </>
          )}

          {/* Legend (only in manual-only mode) */}
          {!queueActive && !queueDone && (
            <div className="mt-6 border-t border-white/60 pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Status-Legende</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <span key={v} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[v as HitStatus]}`}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
