"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface EuipoConfig {
  default_klassen: string;
  nur_in_kraft: boolean;
  zeitraum_monate: number;
}

interface BrandStem {
  id: string;
  stamm: string;
  aktiv: boolean;
  created_at: string;
}

interface EuipoStats {
  total: number;
  last30d: number;
}

const DEFAULT_CONFIG: EuipoConfig = {
  default_klassen: "36 37 42",
  nur_in_kraft: false,
  zeitraum_monate: 0,
};

export function EuipoSettingsClient({
  config: initialConfig,
  stems,
  stats,
}: {
  config: EuipoConfig;
  stems: BrandStem[];
  stats: EuipoStats;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [config, setConfig] = useState<EuipoConfig>({ ...DEFAULT_CONFIG, ...initialConfig });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [newStem, setNewStem] = useState("");

  const saveConfig = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ euipo_config: config }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({ type: "ok", text: "Einstellungen gespeichert" });
        router.refresh();
      } else {
        setMsg({ type: "err", text: data.error ?? "Fehler" });
      }
    });
  };

  const addStem = () => {
    const val = newStem.trim().toLowerCase();
    if (!val) return;
    startTransition(async () => {
      const res = await fetch("/api/stems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stamm: val }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewStem("");
        router.refresh();
      } else {
        setMsg({ type: "err", text: data.error ?? "Fehler beim Hinzufügen" });
      }
    });
  };

  const toggleStem = (id: string, aktiv: boolean) => {
    startTransition(async () => {
      await fetch(`/api/stems/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktiv }),
      });
      router.refresh();
    });
  };

  const deleteStem = (id: string) => {
    startTransition(async () => {
      await fetch(`/api/stems/${id}`, { method: "DELETE" });
      router.refresh();
    });
  };

  const triggerScan = () => {
    setScanResult(null);
    startTransition(async () => {
      setScanResult("Scan gestartet…");
      const res = await fetch("/api/euipo/search/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          klassen: config.default_klassen,
          nurInKraft: config.nur_in_kraft,
          zeitraumMonate: config.zeitraum_monate || undefined,
        }),
      });
      if (!res.ok || !res.body) {
        setScanResult(`Fehler: HTTP ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let newC = 0;
      let updC = 0;
      let errC = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "hit:new") newC++;
            if (ev.type === "hit:dup") updC++;
            if (ev.type === "error") errC++;
            if (ev.type === "done") {
              setScanResult(`✓ Scan abgeschlossen: ${newC} neu, ${updC} bekannt, ${errC} Fehler`);
            }
          } catch {}
        }
      }
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">EUIPO-Modul</h1>
          <p className="mt-1 text-sm text-stone-500">EU-Markenamt · REST-API-basierte Suche</p>
        </div>
        <Link href="/settings" className="text-xs text-stone-500 hover:text-stone-800">
          ← Einstellungen
        </Link>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: "EUIPO-Treffer gesamt", value: stats.total.toLocaleString("de-DE") },
          { label: "Letzte 30 Tage", value: stats.last30d.toLocaleString("de-DE") },
          { label: "Aktive Suchstämme", value: stems.filter((s) => s.aktiv).length },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5">
            <div className="text-2xl font-bold text-stone-900">{s.value}</div>
            <div className="mt-1 text-xs text-stone-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Config */}
      <section className="glass rounded-2xl p-6">
        <h2 className="mb-5 text-base font-semibold text-stone-900">Sucheinstellungen</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">Standard-Nizza-Klassen</label>
            <input
              type="text"
              value={config.default_klassen}
              onChange={(e) => setConfig({ ...config, default_klassen: e.target.value })}
              placeholder="36 37 42"
              disabled={pending}
              className="h-10 w-full rounded-full border border-stone-200 bg-white/70 px-4 text-sm text-stone-800 outline-none focus:border-stone-400 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-stone-400">Leerzeichen- oder kommagetrennte Klassen-Nummern</p>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.nur_in_kraft}
              onChange={(e) => setConfig({ ...config, nur_in_kraft: e.target.checked })}
              disabled={pending}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm text-stone-700">Nur aktive Marken (Registered / Filed / Published)</span>
          </label>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">Zeitraum (Monate rückblickend)</label>
            <input
              type="number"
              min={0}
              max={120}
              value={config.zeitraum_monate}
              onChange={(e) => setConfig({ ...config, zeitraum_monate: Number(e.target.value) })}
              disabled={pending}
              className="h-10 w-32 rounded-full border border-stone-200 bg-white/70 px-4 text-sm text-stone-800 outline-none focus:border-stone-400 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-stone-400">0 = kein Zeitlimit</p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={saveConfig}
            disabled={pending}
            className="rounded-full bg-stone-900 px-5 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Speichern…" : "Speichern"}
          </button>
          {msg && (
            <span className={`text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-rose-500"}`}>
              {msg.text}
            </span>
          )}
        </div>
      </section>

      {/* Brand stems */}
      <section className="glass rounded-2xl p-6">
        <h2 className="mb-1 text-base font-semibold text-stone-900">Suchstämme</h2>
        <p className="mb-5 text-xs text-stone-500">Geteilte Basis mit DPMA und Web-Scan</p>

        <div className="mb-4 space-y-2">
          {stems.length === 0 && (
            <p className="text-sm text-stone-400">Noch keine Suchstämme angelegt.</p>
          )}
          {stems.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 bg-white/60 px-4 py-2.5">
              <span className={`flex-1 text-sm font-medium ${s.aktiv ? "text-stone-800" : "text-stone-400 line-through"}`}>
                {s.stamm}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleStem(s.id, !s.aktiv)}
                  disabled={pending}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    s.aktiv
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  {s.aktiv ? "Aktiv" : "Inaktiv"}
                </button>
                <button
                  onClick={() => deleteStem(s.id)}
                  disabled={pending}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); addStem(); }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={newStem}
            onChange={(e) => setNewStem(e.target.value)}
            placeholder="Neuer Stamm…"
            disabled={pending}
            className="h-9 flex-1 rounded-full border border-stone-200 bg-white/70 px-4 text-sm text-stone-800 outline-none focus:border-stone-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending || !newStem.trim()}
            className="h-9 rounded-full bg-stone-800 px-4 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-40"
          >
            Hinzufügen
          </button>
        </form>
      </section>

      {/* Manual scan */}
      <section className="glass rounded-2xl p-6">
        <h2 className="mb-1 text-base font-semibold text-stone-900">Manueller Scan</h2>
        <p className="mb-5 text-xs text-stone-500">
          Startet eine vollständige EUIPO-Suche mit den obigen Einstellungen. Ergebnisse erscheinen
          direkt im Dashboard.
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={triggerScan}
            disabled={pending}
            className="rounded-full bg-stone-900 px-5 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Scan läuft…" : "Scan starten"}
          </button>
          {scanResult && (
            <span className={`text-xs ${scanResult.startsWith("✓") ? "text-emerald-600" : "text-stone-600"}`}>
              {scanResult}
            </span>
          )}
        </div>
      </section>

      {/* API info */}
      <section className="rounded-2xl border border-stone-100 bg-stone-50/60 p-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400">API-Info</h3>
        <div className="space-y-1 text-[11px] text-stone-500">
          <p>Datenquelle: EUIPO eSearch Plus REST-API</p>
          <p>Endpunkt: <code className="rounded bg-stone-100 px-1 py-0.5 text-stone-700">euipo.europa.eu/eSearchCLPAPI/api/v1/trademark/search</code></p>
          <p>Keine Authentifizierung erforderlich · Serverseite · max. 500 Treffer pro Variante</p>
        </div>
      </section>
    </div>
  );
}
