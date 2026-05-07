"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Note {
  id: string;
  text: string;
  created_by: string | null;
  created_at: string;
}

type Status = "new" | "reviewing" | "confirmed" | "dismissed" | "sent_to_lawyer" | "resolved";

const STATUS_OPTIONS: { value: Status; label: string; base: string; active: string }[] = [
  { value: "new",            label: "Offen",      base: "bg-stone-100 text-stone-600 hover:bg-stone-200",     active: "bg-stone-800 text-white" },
  { value: "reviewing",      label: "In Prüfung", base: "bg-amber-100 text-amber-700 hover:bg-amber-200",     active: "bg-amber-500 text-white" },
  { value: "confirmed",      label: "Bestätigt",  base: "bg-rose-100 text-rose-700 hover:bg-rose-200",        active: "bg-rose-600 text-white" },
  { value: "dismissed",      label: "Verworfen",  base: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200", active: "bg-emerald-600 text-white" },
  { value: "sent_to_lawyer", label: "An Anwalt",  base: "bg-purple-100 text-purple-700 hover:bg-purple-200",  active: "bg-purple-600 text-white" },
  { value: "resolved",       label: "Erledigt",   base: "bg-sky-100 text-sky-700 hover:bg-sky-200",           active: "bg-sky-600 text-white" },
];

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function initials(email: string | null): string {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}

interface NotesFeedProps {
  notesUrl: string;
  /** If provided, shows quick-status chips and auto-sets status on note submit */
  statusUrl?: string;
  currentStatus?: Status;
}

export function NotesFeed({ notesUrl, statusUrl, currentStatus }: NotesFeedProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>(currentStatus ?? "new");
  const [statusSaving, setStatusSaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch(notesUrl);
      if (!res.ok) return;
      const data = await res.json();
      setNotes(data.notes ?? []);
      setLoaded(true);
    } catch {
      // silent
    }
  }, [notesUrl]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loaded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes, loaded]);

  const patchStatus = useCallback(async (newStatus: Status) => {
    if (!statusUrl) return;
    setStatusSaving(true);
    try {
      await fetch(statusUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setStatus(newStatus);
      router.refresh();
    } finally {
      setStatusSaving(false);
    }
  }, [statusUrl, router]);

  const handleStatusClick = (newStatus: Status) => {
    if (newStatus === status || statusSaving) return;
    patchStatus(newStatus);
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(notesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) { setError("Fehler beim Speichern."); return; }
      const data = await res.json();
      setNotes((p) => [...p, data.note]);
      setText("");

      // Auto-advance to "reviewing" when the first note is added on a new hit
      if (statusUrl && status === "new") {
        await patchStatus("reviewing");
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
  };

  return (
    <section className="glass p-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">
        Status-Feed
        {notes.length > 0 && (
          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500 normal-case">
            {notes.length}
          </span>
        )}
      </h2>

      {/* Quick status chips */}
      {statusUrl && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusClick(opt.value)}
              disabled={statusSaving}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                status === opt.value ? opt.active : opt.base
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="mb-4 max-h-72 space-y-3 overflow-y-auto">
        {!loaded && <p className="text-xs text-stone-400">Lade Einträge…</p>}
        {loaded && notes.length === 0 && (
          <p className="text-xs text-stone-400">Noch keine Einträge. Schreibe den ersten Status-Update.</p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-800 text-[10px] font-bold text-white">
              {initials(n.created_by)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold text-stone-700">{n.created_by ?? "Unbekannt"}</span>
                <span className="text-[10px] text-stone-400">{relTime(n.created_at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{n.text}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/60 pt-4">
        <textarea
          rows={3}
          placeholder="Status-Update schreiben… (Strg+Enter zum Senden)"
          className="w-full resize-none rounded-xl border border-stone-200 bg-white/60 px-3 py-2.5 text-sm leading-relaxed placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-stone-400">Strg+Enter zum Senden</span>
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            {sending ? "Wird gespeichert…" : "Eintrag speichern"}
          </button>
        </div>
      </div>
    </section>
  );
}
