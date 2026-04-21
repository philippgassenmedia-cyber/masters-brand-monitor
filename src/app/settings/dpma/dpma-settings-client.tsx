"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ImapAccount {
  id: string;
  label: string;
  imap_host: string;
  imap_port: number;
  username: string;
  use_ssl: boolean;
  inbox_folder: string;
  processed_folder: string;
  review_folder: string;
  is_active: boolean;
  last_check_at: string | null;
  last_check_status: string | null;
  last_check_message: string | null;
  created_at: string;
}

interface Subscription {
  id: string;
  name: string;
  email: string;
  frequency: string;
  is_active: boolean;
  created_at: string;
}

interface BrandStem {
  id: string;
  stem: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const DEFAULT_FORM = {
  label: "DPMAkurier",
  imap_host: "imap.gmail.com",
  imap_port: 993,
  username: "",
  password: "",
  use_ssl: true,
  inbox_folder: "INBOX",
  processed_folder: "Processed",
  review_folder: "Review",
};

export function DpmaSettingsClient({
  accounts,
  subscriptions,
  stems,
}: {
  accounts: ImapAccount[];
  subscriptions: Subscription[];
  stems: BrandStem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [fetchResult, setFetchResult] = useState<string | null>(null);

  // IMAP form
  const active = accounts.find((a) => a.is_active);
  const [form, setForm] = useState({
    id: active?.id,
    label: active?.label ?? DEFAULT_FORM.label,
    imap_host: active?.imap_host ?? DEFAULT_FORM.imap_host,
    imap_port: active?.imap_port ?? DEFAULT_FORM.imap_port,
    username: active?.username ?? DEFAULT_FORM.username,
    password: "",
    use_ssl: active?.use_ssl ?? DEFAULT_FORM.use_ssl,
    inbox_folder: active?.inbox_folder ?? DEFAULT_FORM.inbox_folder,
    processed_folder: active?.processed_folder ?? DEFAULT_FORM.processed_folder,
    review_folder: active?.review_folder ?? DEFAULT_FORM.review_folder,
  });

  // New stem form
  const [newStem, setNewStem] = useState("");

  const saveImap = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/dpma/imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({ type: "ok", text: "IMAP-Konto gespeichert" });
        setForm((f) => ({ ...f, id: data.id, password: "" }));
        router.refresh();
      } else {
        setMsg({ type: "err", text: data.error ?? "Fehler beim Speichern" });
      }
    });
  };

  const testConnection = () => {
    setTestResult(null);
    startTransition(async () => {
      const res = await fetch("/api/dpma/imap/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data.ok ? "Verbindung erfolgreich" : `Fehler: ${data.error}`);
    });
  };

  const fetchNow = () => {
    setFetchResult(null);
    startTransition(async () => {
      const res = await fetch("/api/dpma/run", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const r = data.result;
        setFetchResult(
          `${r.totalEmails} Mails, ${r.newTrademarks} neue Treffer, ${r.errors?.length ?? 0} Fehler`,
        );
      } else {
        setFetchResult(`Fehler: ${data.error}`);
      }
      router.refresh();
    });
  };

  const addStem = () => {
    if (!newStem.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/dpma/stems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stem: newStem.trim() }),
      });
      if (res.ok) {
        setNewStem("");
        router.refresh();
      }
    });
  };

  const deleteStem = (id: string) => {
    if (!confirm("Markenstamm wirklich löschen?")) return;
    startTransition(async () => {
      await fetch("/api/dpma/stems", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    });
  };

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">DPMA-Einstellungen</h1>
          <p className="mt-1 text-sm text-stone-600">
            IMAP-Zugangsdaten, Markenstämme und Monitoring-Abonnements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="text-xs text-stone-500 hover:text-stone-800"
          >
            ← Allgemeine Einstellungen
          </Link>
        </div>
      </header>

      {msg && (
        <div
          className={`mb-4 rounded-2xl px-4 py-2 text-sm ${
            msg.type === "ok"
              ? "border border-emerald-200 bg-emerald-50/80 text-emerald-800"
              : "border border-rose-200 bg-rose-50/80 text-rose-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* IMAP Credentials */}
      <section className="glass p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">IMAP-Zugangsdaten</h2>
        <p className="mb-4 text-xs text-stone-500">
          Richte die E-Mail-Verbindung zum DPMAkurier ein. Bei Gmail: Verwende ein{" "}
          <strong>App-Passwort</strong> (Kontoeinstellungen &rarr; Sicherheit &rarr;
          App-Passwörter), nicht dein reguläres Passwort.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <PillInput
            label="Bezeichnung"
            value={form.label}
            onChange={(v) => setForm({ ...form, label: v })}
            placeholder="DPMAkurier"
            disabled={pending}
          />
          <PillInput
            label="IMAP-Server"
            value={form.imap_host}
            onChange={(v) => setForm({ ...form, imap_host: v })}
            placeholder="imap.gmail.com"
            disabled={pending}
          />
          <PillInput
            label="Port"
            value={String(form.imap_port)}
            onChange={(v) => setForm({ ...form, imap_port: Number(v) || 993 })}
            type="number"
            disabled={pending}
          />
          <PillInput
            label="Benutzername / E-Mail"
            value={form.username}
            onChange={(v) => setForm({ ...form, username: v })}
            placeholder="meinemail@gmail.com"
            disabled={pending}
          />
          <PillInput
            label={form.id ? "Passwort (leer = unverändert)" : "Passwort / App-Passwort"}
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="••••••••"
            type="password"
            disabled={pending}
          />
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-xs text-stone-700">
              <input
                type="checkbox"
                checked={form.use_ssl}
                onChange={(e) => setForm({ ...form, use_ssl: e.target.checked })}
                className="h-4 w-4 rounded"
                disabled={pending}
              />
              SSL/TLS
            </label>
          </div>
          <PillInput
            label="Posteingang"
            value={form.inbox_folder}
            onChange={(v) => setForm({ ...form, inbox_folder: v })}
            placeholder="INBOX"
            disabled={pending}
          />
          <PillInput
            label="Verarbeitet-Ordner"
            value={form.processed_folder}
            onChange={(v) => setForm({ ...form, processed_folder: v })}
            placeholder="Processed"
            disabled={pending}
          />
        </div>

        {/* Status of last check */}
        {active?.last_check_at && (
          <div className="mt-4 rounded-xl border border-white/70 bg-white/50 px-4 py-2 text-[12px] text-stone-600">
            <span className="font-semibold text-stone-800">Letzter Abruf: </span>
            {new Date(active.last_check_at).toLocaleString("de-DE")} —{" "}
            <span
              className={
                active.last_check_status === "ok" ? "text-emerald-700" : "text-rose-700"
              }
            >
              {active.last_check_status}
            </span>
            {active.last_check_message && ` · ${active.last_check_message}`}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={saveImap}
            disabled={pending}
            className="h-10 rounded-full bg-stone-900 px-6 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 disabled:opacity-60"
          >
            {pending ? "Speichere…" : "Speichern"}
          </button>
          <button
            onClick={testConnection}
            disabled={pending}
            className="h-10 rounded-full border border-white/80 bg-white/60 px-6 text-xs font-semibold text-stone-700 hover:bg-white/90 disabled:opacity-60"
          >
            Verbindung testen
          </button>
          <button
            onClick={fetchNow}
            disabled={pending}
            className="h-10 rounded-full border border-white/80 bg-white/60 px-6 text-xs font-semibold text-stone-700 hover:bg-white/90 disabled:opacity-60"
          >
            Jetzt abrufen
          </button>
        </div>

        {testResult && (
          <div
            className={`mt-3 rounded-xl px-4 py-2 text-xs ${
              testResult.startsWith("Fehler")
                ? "border border-rose-200 bg-rose-50/80 text-rose-800"
                : "border border-emerald-200 bg-emerald-50/80 text-emerald-800"
            }`}
          >
            {testResult}
          </div>
        )}
        {fetchResult && (
          <div
            className={`mt-3 rounded-xl px-4 py-2 text-xs ${
              fetchResult.startsWith("Fehler")
                ? "border border-rose-200 bg-rose-50/80 text-rose-800"
                : "border border-emerald-200 bg-emerald-50/80 text-emerald-800"
            }`}
          >
            {fetchResult}
          </div>
        )}
      </section>

      {/* Brand Stems */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Markenstämme</h2>
        <p className="mb-4 text-xs text-stone-500">
          Diese Stämme werden für die Register-Suche und das Mail-Parsing verwendet.
          Phonetische Varianten werden automatisch generiert.
        </p>

        <div className="space-y-2">
          {stems.length === 0 && (
            <p className="text-sm text-stone-500">Noch keine Markenstämme konfiguriert.</p>
          )}
          {stems.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-white/70 bg-white/60 px-4 py-2.5"
            >
              <div>
                <span className="text-sm font-semibold text-stone-900">{s.stem}</span>
                {s.description && (
                  <span className="ml-2 text-xs text-stone-500">{s.description}</span>
                )}
              </div>
              <button
                onClick={() => deleteStem(s.id)}
                disabled={pending}
                className="rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newStem}
            onChange={(e) => setNewStem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addStem()}
            placeholder="z.B. MASTER"
            className="h-10 w-64 rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none transition focus:border-stone-400 focus:bg-white/90"
            disabled={pending}
          />
          <button
            onClick={addStem}
            disabled={pending || !newStem.trim()}
            className="h-10 rounded-full bg-stone-900 px-5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
          >
            Hinzufügen
          </button>
        </div>
      </section>

      {/* Monitoring Subscriptions */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">DPMAkurier-Abonnements</h2>
        <p className="mb-4 text-xs text-stone-500">
          Übersicht der aktiven DPMAkurier-Abonnements, die per E-Mail überwacht werden.
        </p>

        {subscriptions.length === 0 ? (
          <p className="text-sm text-stone-500">
            Keine Abonnements gefunden. Richte ein DPMAkurier-Abonnement auf{" "}
            <a
              href="https://www.dpma.de/marken/kurier/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-stone-800 underline"
            >
              dpma.de
            </a>{" "}
            ein und leite die Mails an das konfigurierte IMAP-Konto weiter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">E-Mail</th>
                  <th className="px-4 py-2 font-semibold">Frequenz</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr
                    key={sub.id}
                    className="border-t border-white/50 transition hover:bg-white/50"
                  >
                    <td className="px-4 py-2 font-medium text-stone-900">{sub.name}</td>
                    <td className="px-4 py-2 text-stone-600">{sub.email}</td>
                    <td className="px-4 py-2 text-stone-600">{sub.frequency}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          sub.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {sub.is_active ? "Aktiv" : "Inaktiv"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[11px] text-stone-500">
                      {new Date(sub.created_at).toLocaleDateString("de-DE")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PillInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-12 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 placeholder:text-stone-400 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md outline-none transition focus:border-stone-400 focus:bg-white/90 disabled:opacity-60"
      />
    </div>
  );
}
