"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";

interface StorageFile {
  storagePath: string;
  name: string;
  size: number;
  createdAt: string;
  linkedCount: number;
}

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
  attachment_url: string | null;
}

type FileStatus =
  | { state: "pending" }
  | { state: "extracting" }
  | { state: "done"; hits: number }
  | { state: "error"; msg: string };

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
  attachment_url: null,
};

const MAX_FILES = 10;
const CONCURRENCY = 3;

async function extractFile(
  file: File,
  onStatus: (s: FileStatus) => void,
): Promise<ImportHit[]> {
  onStatus({ state: "extracting" });
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/hits/import", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      onStatus({ state: "error", msg: data.error ?? "Extraktion fehlgeschlagen" });
      return [];
    }
    const hits: ImportHit[] = (data.hits ?? []).map((h: ImportHit) => ({
      ...h,
      attachment_url: data.attachmentPath ?? null,
    }));
    onStatus({ state: "done", hits: hits.length });
    return hits;
  } catch {
    onStatus({ state: "error", msg: "Netzwerkfehler" });
    return [];
  }
}

export function ImportClient() {
  const [tab, setTab] = useState<"pdf" | "manual" | "uploads">("pdf");

  // ── Review queue ─────────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<ImportHit[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const queueActive = queue.length > 0 && queueIdx < queue.length;
  const queueDone = queue.length > 0 && queueIdx >= queue.length;

  // ── Manual form ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState<ImportHit>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [manualResult, setManualResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const setField = <K extends keyof ImportHit>(k: K, v: ImportHit[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

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
        body: JSON.stringify([form]),
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
        setManualResult({ ok: false, msg: "Bereits vorhanden — URL doppelt." });
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

  const resetAll = () => {
    setQueue([]);
    setQueueIdx(0);
    setImported(0);
    setSkipped(0);
    setForm({ ...EMPTY });
    setManualResult(null);
    setPdfFiles([]);
    setFileStatuses({});
    setExtracting(false);
    setTab("pdf");
  };

  // ── PDF batch upload ─────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileStatus>>({});
  const [extracting, setExtracting] = useState(false);

  // ── Uploads tab ──────────────────────────────────────────────────────────────
  const [uploads, setUploads] = useState<StorageFile[] | null>(null);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [relinkingPath, setRelinkingPath] = useState<string | null>(null);
  const [relinkResults, setRelinkResults] = useState<Record<string, number>>({});

  const loadUploads = useCallback(async () => {
    setUploadsLoading(true);
    try {
      const res = await fetch("/api/hits/import/uploads");
      const data = await res.json();
      setUploads(data.files ?? []);
    } catch {
      setUploads([]);
    } finally {
      setUploadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "uploads" && uploads === null) {
      loadUploads();
    }
  }, [tab, uploads, loadUploads]);

  const relinkFile = async (file: StorageFile) => {
    setRelinkingPath(file.storagePath);
    try {
      const res = await fetch("/api/hits/import/relink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: file.storagePath, createdAt: file.createdAt }),
      });
      const data = await res.json();
      setRelinkResults((prev) => ({ ...prev, [file.storagePath]: data.linked ?? 0 }));
      // Refresh uploads list to show updated linkedCount
      await loadUploads();
    } finally {
      setRelinkingPath(null);
    }
  };

  const setFileStatus = useCallback((name: string, status: FileStatus) => {
    setFileStatuses((prev) => ({ ...prev, [name]: status }));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FILES);
    setPdfFiles(files);
    const statuses: Record<string, FileStatus> = {};
    for (const f of files) statuses[f.name] = { state: "pending" };
    setFileStatuses(statuses);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files)
      .filter((f) => f.type === "application/pdf")
      .slice(0, MAX_FILES);
    if (!files.length) return;
    setPdfFiles(files);
    const statuses: Record<string, FileStatus> = {};
    for (const f of files) statuses[f.name] = { state: "pending" };
    setFileStatuses(statuses);
  }, []);

  const removeFile = (name: string) => {
    setPdfFiles((prev) => prev.filter((f) => f.name !== name));
    setFileStatuses((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const extractAll = useCallback(async () => {
    if (!pdfFiles.length) return;
    setExtracting(true);

    const allHits: ImportHit[] = [];

    // Process in batches of CONCURRENCY
    for (let i = 0; i < pdfFiles.length; i += CONCURRENCY) {
      const batch = pdfFiles.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((file) => extractFile(file, (s) => setFileStatus(file.name, s))),
      );
      for (const hits of results) allHits.push(...hits);
    }

    setExtracting(false);

    if (allHits.length === 0) return;

    setQueue(allHits);
    setQueueIdx(0);
    setImported(0);
    setSkipped(0);
    loadFromQueue(allHits, 0);
    setManualResult(null);
    setTab("manual");
  }, [pdfFiles, setFileStatus, loadFromQueue]);

  const doneCount = Object.values(fileStatuses).filter((s) => s.state === "done" || s.state === "error").length;
  const totalHitsFound = Object.values(fileStatuses).reduce(
    (sum, s) => sum + (s.state === "done" ? s.hits : 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-stone-900">Treffer importieren</h1>
          <p className="text-xs text-stone-500">
            Manuelle Eingabe oder bis zu {MAX_FILES} PDF-Berichte gleichzeitig hochladen
          </p>
        </div>
        <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">← Übersicht</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/70 bg-white/40 p-1">
        {(["pdf", "manual", "uploads"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
              tab === t ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:bg-white/60"
            }`}
          >
            {t === "pdf" ? "PDF-Upload" : t === "manual" ? "Manuell" : "Uploads"}
          </button>
        ))}
      </div>

      {/* ── PDF-Tab ──────────────────────────────────────────────────────────── */}
      {tab === "pdf" && (
        <div className="glass space-y-4 rounded-2xl p-5">
          <p className="text-xs text-stone-500">
            Lade bis zu {MAX_FILES} Berichte als PDF hoch. Die KI extrahiert alle Treffer parallel
            und öffnet sie zur manuellen Prüfung — Treffer für Treffer.
          </p>

          {/* Drop zone */}
          <label
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-stone-200 bg-white/40 px-6 py-8 text-center transition hover:border-stone-400 hover:bg-white/70"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div>
              <p className="text-sm font-medium text-stone-700">
                {pdfFiles.length === 0
                  ? "PDF-Dateien auswählen oder hierhin ziehen"
                  : `${pdfFiles.length} Datei${pdfFiles.length !== 1 ? "en" : ""} ausgewählt`}
              </p>
              <p className="text-xs text-stone-400">max. {MAX_FILES} PDFs · je max. 15 MB</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              multiple
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>

          {/* File list */}
          {pdfFiles.length > 0 && (
            <div className="space-y-2">
              {pdfFiles.map((file) => {
                const status = fileStatuses[file.name] ?? { state: "pending" };
                return (
                  <div key={file.name} className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/50 px-4 py-2.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-400">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-stone-800">{file.name}</p>
                      <p className="text-[10px] text-stone-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <div className="shrink-0">
                      {status.state === "pending" && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">Ausstehend</span>
                      )}
                      {status.state === "extracting" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 animate-pulse">Wird verarbeitet…</span>
                      )}
                      {status.state === "done" && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          ✓ {status.hits} Treffer
                        </span>
                      )}
                      {status.state === "error" && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700" title={status.msg}>
                          ✗ Fehler
                        </span>
                      )}
                    </div>
                    {!extracting && status.state === "pending" && (
                      <button
                        onClick={() => removeFile(file.name)}
                        className="shrink-0 text-stone-300 hover:text-stone-600 transition"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                );
              })}

              {extracting && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-stone-500">
                    <span>{doneCount} von {pdfFiles.length} verarbeitet</span>
                    <span>{totalHitsFound} Treffer gefunden</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-stone-900 transition-all duration-500"
                      style={{ width: `${(doneCount / pdfFiles.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {pdfFiles.length > 0 && !extracting && (
            <button
              onClick={extractAll}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              {pdfFiles.length === 1
                ? "Treffer extrahieren & prüfen"
                : `${pdfFiles.length} PDFs extrahieren & prüfen`}
            </button>
          )}

          {pdfFiles.length === MAX_FILES && (
            <p className="text-center text-[10px] text-stone-400">Maximum von {MAX_FILES} Dateien erreicht.</p>
          )}
        </div>
      )}

      {/* ── Manuell-Tab ──────────────────────────────────────────────────────── */}
      {tab === "manual" && (
        <div className="glass rounded-2xl p-5">

          {queueDone && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-sm text-emerald-800">
                <strong>Alle {queue.length} Treffer geprüft.</strong>
                {" "}{imported} importiert · {skipped} übersprungen
                {" — "}
                <Link href="/" className="underline">Zur Übersicht</Link>
              </div>
              <button onClick={resetAll} className="text-xs text-emerald-700 underline hover:text-emerald-900">
                Neuer Import
              </button>
            </div>
          )}

          {queueActive && (
            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  KI-Vorschlag · Treffer {queueIdx + 1} von {queue.length}
                </span>
                <div className="flex items-center gap-3">
                  {form.attachment_url && (
                    <a
                      href={`/api/hits/import/preview-pdf?path=${encodeURIComponent(form.attachment_url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] font-medium text-orange-700 hover:underline"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      PDF ansehen
                    </a>
                  )}
                  <button onClick={resetAll} className="text-[11px] text-stone-400 underline hover:text-stone-600">
                    Abbrechen
                  </button>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-stone-900 transition-all"
                  style={{ width: `${(queueIdx / queue.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-stone-500">
                Felder wurden von der KI vorausgefüllt. Bitte prüfen, ggf. anpassen und bestätigen.
              </p>
            </div>
          )}

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

      {/* ── Uploads-Tab ──────────────────────────────────────────────────────── */}
      {tab === "uploads" && (
        <div className="glass space-y-4 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500">
              Hochgeladene PDFs aus dem Storage. Treffer ohne Verknüpfung können hier nachträglich mit dem jeweiligen PDF verbunden werden.
            </p>
            <button
              onClick={loadUploads}
              disabled={uploadsLoading}
              className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-white/60 transition disabled:opacity-50"
            >
              {uploadsLoading ? "Lädt…" : "Aktualisieren"}
            </button>
          </div>

          {uploadsLoading && uploads === null && (
            <div className="flex items-center justify-center py-8 text-xs text-stone-400">
              Lädt Uploads…
            </div>
          )}

          {!uploadsLoading && uploads !== null && uploads.length === 0 && (
            <div className="flex items-center justify-center py-8 text-xs text-stone-400">
              Keine hochgeladenen PDFs gefunden.
            </div>
          )}

          {uploads !== null && uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map((file) => {
                const isRelinking = relinkingPath === file.storagePath;
                const relinkResult = relinkResults[file.storagePath];
                return (
                  <div key={file.storagePath} className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/50 px-4 py-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-400">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-stone-800">{file.name}</p>
                      <p className="text-[10px] text-stone-400">
                        {(file.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                        {new Date(file.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {file.linkedCount > 0 ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          ✓ {file.linkedCount} verknüpft
                        </span>
                      ) : relinkResult !== undefined ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${relinkResult > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {relinkResult > 0 ? `✓ ${relinkResult} verknüpft` : "Kein Treffer gefunden"}
                        </span>
                      ) : (
                        <button
                          onClick={() => relinkFile(file)}
                          disabled={isRelinking}
                          className="rounded-lg bg-stone-900 px-3 py-1 text-[10px] font-medium text-white hover:bg-stone-700 transition disabled:opacity-50"
                        >
                          {isRelinking ? "Verknüpfe…" : "Verknüpfen"}
                        </button>
                      )}
                      <a
                        href={`/api/hits/import/preview-pdf?path=${encodeURIComponent(file.storagePath)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-orange-700 hover:underline"
                      >
                        PDF
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
