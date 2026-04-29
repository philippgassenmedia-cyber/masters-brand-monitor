"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ProfileData {
  display_name: string;
  company: string;
  email: string;
  role: string;
}

interface ScheduleData {
  mode: "daily" | "weekly" | "every_n_days" | "every_n_weeks" | "every_n_months";
  interval: number;
  day_of_week: number;
  hour: number;
}

interface BrandData {
  brand_name: string;
  brand_owner: string;
  own_domains: string;
  owner_names: string;
}

interface WebSearchData {
  daily_limit: number;
  default_mode: "quick" | "deep";
  default_region: string;
}

interface DpmaSearchData {
  variant_count: number;
  parallel_tabs: number;
  default_klassen: string;
  nur_de: boolean;
  nur_in_kraft: boolean;
  zeitraum_monate: number;
}

const SCHEDULE_MODES = [
  { value: "daily", label: "Täglich" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "every_n_days", label: "Alle X Tage" },
  { value: "every_n_weeks", label: "Alle X Wochen" },
  { value: "every_n_months", label: "Alle X Monate" },
] as const;

const DAYS_OF_WEEK = [
  { value: 0, label: "Sonntag" },
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
];

const DEFAULT_PROFILE: ProfileData = {
  display_name: "",
  company: "Master Immobilien",
  email: "",
  role: "Admin",
};

const DEFAULT_SCHEDULE: ScheduleData = {
  mode: "weekly",
  interval: 1,
  day_of_week: 1,
  hour: 7,
};

const DEFAULT_BRAND: BrandData = {
  brand_name: "MASTER",
  brand_owner: "Masters Immobilien MbH",
  own_domains: "master.de",
  owner_names: "Master Immobilien GmbH, Master Immobiliengesellschaft mbH, Masters Immobilien GmbH",
};

const DEFAULT_WEB_SEARCH: WebSearchData = {
  daily_limit: 200,
  default_mode: "quick",
  default_region: "deutschland",
};

const DEFAULT_DPMA_SEARCH: DpmaSearchData = {
  variant_count: 8,
  parallel_tabs: 3,
  default_klassen: "36 37 42",
  nur_de: true,
  nur_in_kraft: true,
  zeitraum_monate: 3,
};

export function SettingsClient({
  initialSettings,
  userEmail,
}: {
  initialSettings: Record<string, unknown>;
  userEmail: string;
}) {
  const raw = initialSettings as Record<string, Record<string, unknown>>;
  const [profile, setProfile] = useState<ProfileData>({
    ...DEFAULT_PROFILE,
    email: userEmail,
    ...(raw.profile as Partial<ProfileData> | undefined),
  });
  const [schedule, setSchedule] = useState<ScheduleData>({
    ...DEFAULT_SCHEDULE,
    ...(raw.deep_scan_schedule as Partial<ScheduleData> | undefined),
  });
  const [brand, setBrand] = useState<BrandData>({
    ...DEFAULT_BRAND,
    ...(raw.brand as Partial<BrandData> | undefined),
  });
  const [webSearch, setWebSearch] = useState<WebSearchData>({
    ...DEFAULT_WEB_SEARCH,
    ...(raw.web_search as Partial<WebSearchData> | undefined),
  });
  const [dpmaSearch, setDpmaSearch] = useState<DpmaSearchData>({
    ...DEFAULT_DPMA_SEARCH,
    ...(raw.dpma_search as Partial<DpmaSearchData> | undefined),
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          deep_scan_schedule: schedule,
          brand,
          web_search: webSearch,
          dpma_search: dpmaSearch,
        }),
      });
      if (!res.ok) {
        setError("Speichern fehlgeschlagen.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const showInterval =
    schedule.mode === "every_n_days" ||
    schedule.mode === "every_n_weeks" ||
    schedule.mode === "every_n_months";
  const showDayOfWeek =
    schedule.mode === "weekly" || schedule.mode === "every_n_weeks";

  const scheduleLabel = (() => {
    switch (schedule.mode) {
      case "daily":
        return `Jeden Tag um ${schedule.hour}:00 Uhr`;
      case "weekly":
        return `Jeden ${DAYS_OF_WEEK.find((d) => d.value === schedule.day_of_week)?.label} um ${schedule.hour}:00 Uhr`;
      case "every_n_days":
        return `Alle ${schedule.interval} Tage um ${schedule.hour}:00 Uhr`;
      case "every_n_weeks":
        return `Alle ${schedule.interval} Wochen am ${DAYS_OF_WEEK.find((d) => d.value === schedule.day_of_week)?.label} um ${schedule.hour}:00 Uhr`;
      case "every_n_months":
        return `Alle ${schedule.interval} Monate um ${schedule.hour}:00 Uhr`;
      default:
        return "";
    }
  })();

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Einstellungen</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/settings/dpma"
            className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
          >
            DPMA-Modul →
          </Link>
          <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profil */}
        <section className="glass p-6">
          <h2 className="mb-5 text-lg font-semibold text-stone-900">Profil</h2>
          <div className="grid gap-4">
            <PillInput
              label="Anzeigename"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
              value={profile.display_name}
              onChange={(v) => setProfile({ ...profile, display_name: v })}
              placeholder="Max Mustermann"
              disabled={pending}
            />
            <PillInput
              label="Unternehmen"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                </svg>
              }
              value={profile.company}
              onChange={(v) => setProfile({ ...profile, company: v })}
              placeholder="Master Immobilien"
              disabled={pending}
            />
            <PillInput
              label="E-Mail"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              }
              value={profile.email}
              onChange={(v) => setProfile({ ...profile, email: v })}
              placeholder="email@example.com"
              disabled={pending}
            />
            <PillSelect
              label="Rolle"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              }
              value={profile.role}
              onChange={(v) => setProfile({ ...profile, role: v })}
              options={["Admin", "Analyst", "Viewer"]}
              disabled={pending}
            />
          </div>
        </section>

        {/* Deep-Scan Intervall */}
        <section className="glass p-6">
          <h2 className="mb-5 text-lg font-semibold text-stone-900">
            Deep-Scan Intervall
          </h2>
          <div className="grid gap-4">
            <PillSelect
              label="Häufigkeit"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              value={schedule.mode}
              onChange={(v) =>
                setSchedule({
                  ...schedule,
                  mode: v as ScheduleData["mode"],
                  interval: v === "daily" || v === "weekly" ? 1 : schedule.interval,
                })
              }
              options={SCHEDULE_MODES.map((m) => m.value)}
              labels={SCHEDULE_MODES.map((m) => m.label)}
              disabled={pending}
            />

            {showInterval && (
              <PillInput
                label={
                  schedule.mode === "every_n_days"
                    ? "Alle X Tage"
                    : schedule.mode === "every_n_weeks"
                      ? "Alle X Wochen"
                      : "Alle X Monate"
                }
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v4M16 2v4" />
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M3 10h18" />
                  </svg>
                }
                value={String(schedule.interval)}
                onChange={(v) =>
                  setSchedule({ ...schedule, interval: Math.max(1, Number(v) || 1) })
                }
                type="number"
                disabled={pending}
              />
            )}

            {showDayOfWeek && (
              <PillSelect
                label="Wochentag"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v4M16 2v4" />
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M3 10h18" />
                  </svg>
                }
                value={String(schedule.day_of_week)}
                onChange={(v) =>
                  setSchedule({ ...schedule, day_of_week: Number(v) })
                }
                options={DAYS_OF_WEEK.map((d) => String(d.value))}
                labels={DAYS_OF_WEEK.map((d) => d.label)}
                disabled={pending}
              />
            )}

            <PillSelect
              label="Uhrzeit"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              value={String(schedule.hour)}
              onChange={(v) => setSchedule({ ...schedule, hour: Number(v) })}
              options={Array.from({ length: 24 }, (_, i) => String(i))}
              labels={Array.from({ length: 24 }, (_, i) => `${i}:00 Uhr`)}
              disabled={pending}
            />

            <div className="mt-2 rounded-xl border border-white/70 bg-white/50 px-4 py-3 text-[12px] text-stone-600">
              <span className="font-semibold text-stone-800">Nächster Deep-Scan: </span>
              {scheduleLabel}
            </div>
          </div>
        </section>
      </div>

      {/* Marken-Konfiguration */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-5 text-lg font-semibold text-stone-900">Marke & Inhaber</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PillInput
            label="Markenname"
            icon={<IconShield />}
            value={brand.brand_name}
            onChange={(v) => setBrand({ ...brand, brand_name: v })}
            placeholder="MASTER"
            disabled={pending}
          />
          <PillInput
            label="Markeninhaber"
            icon={<IconBuilding />}
            value={brand.brand_owner}
            onChange={(v) => setBrand({ ...brand, brand_owner: v })}
            placeholder="Masters Immobilien MbH"
            disabled={pending}
          />
          <PillInput
            label="Eigene Domains (kommagetrennt)"
            icon={<IconGlobe />}
            value={brand.own_domains}
            onChange={(v) => setBrand({ ...brand, own_domains: v })}
            placeholder="master.de"
            disabled={pending}
          />
          <div className="sm:col-span-2">
            <PillInput
              label="Firmennamen-Varianten des Inhabers (kommagetrennt)"
              icon={<IconShield />}
              value={brand.owner_names}
              onChange={(v) => setBrand({ ...brand, owner_names: v })}
              placeholder="Master Immobilien GmbH, Masters Immobilien GmbH"
              disabled={pending}
            />
          </div>
        </div>
      </section>

      {/* Web-Suche */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-5 text-lg font-semibold text-stone-900">Web-Suche</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <PillInput
            label="Tägliches API-Limit"
            icon={<IconClock />}
            value={String(webSearch.daily_limit)}
            onChange={(v) => setWebSearch({ ...webSearch, daily_limit: Number(v) || 200 })}
            type="number"
            disabled={pending}
          />
          <PillSelect
            label="Standard-Modus"
            icon={<IconClock />}
            value={webSearch.default_mode}
            onChange={(v) => setWebSearch({ ...webSearch, default_mode: v as "quick" | "deep" })}
            options={["quick", "deep"]}
            labels={["Quick (≤ 15 Min)", "Deep (bis 1h+)"]}
            disabled={pending}
          />
          <PillSelect
            label="Standard-Region"
            icon={<IconGlobe />}
            value={webSearch.default_region}
            onChange={(v) => setWebSearch({ ...webSearch, default_region: v })}
            options={["deutschland", "hessen", "dach", "eu", "welt"]}
            labels={["Deutschland", "Hessen", "DACH", "Europa", "Weltweit"]}
            disabled={pending}
          />
        </div>
      </section>

      {/* DPMA-Suche */}
      <section className="glass mt-6 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900">DPMA-Register</h2>
          <Link
            href="/settings/dpma"
            className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
          >
            IMAP & Stämme →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <PillInput
            label="Anzahl Suchvarianten"
            icon={<IconClock />}
            value={String(dpmaSearch.variant_count)}
            onChange={(v) => setDpmaSearch({ ...dpmaSearch, variant_count: Math.max(1, Number(v) || 8) })}
            type="number"
            disabled={pending}
          />
          <PillInput
            label="Parallele Browser-Tabs"
            icon={<IconClock />}
            value={String(dpmaSearch.parallel_tabs)}
            onChange={(v) => setDpmaSearch({ ...dpmaSearch, parallel_tabs: Math.max(1, Math.min(5, Number(v) || 3)) })}
            type="number"
            disabled={pending}
          />
          <PillInput
            label="Standard Nizza-Klassen"
            icon={<IconShield />}
            value={dpmaSearch.default_klassen}
            onChange={(v) => setDpmaSearch({ ...dpmaSearch, default_klassen: v })}
            placeholder="36 37 42"
            disabled={pending}
          />
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={dpmaSearch.nur_de} onChange={(e) => setDpmaSearch({ ...dpmaSearch, nur_de: e.target.checked })} className="h-4 w-4 rounded" disabled={pending} />
            Nur deutsche Marken
          </label>
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={dpmaSearch.nur_in_kraft} onChange={(e) => setDpmaSearch({ ...dpmaSearch, nur_in_kraft: e.target.checked })} className="h-4 w-4 rounded" disabled={pending} />
            Nur in Kraft befindliche
          </label>
          <PillSelect
            label="Standard-Zeitraum"
            icon={<IconClock />}
            value={String(dpmaSearch.zeitraum_monate)}
            onChange={(v) => setDpmaSearch({ ...dpmaSearch, zeitraum_monate: Number(v) })}
            options={["1", "3", "6", "12", "0"]}
            labels={["4 Wochen", "3 Monate", "6 Monate", "1 Jahr", "Kein Filter"]}
            disabled={pending}
          />
        </div>
      </section>

      {/* DPMA Lokaler Agent */}
      <DpmaAgentSection />

      {/* Geplante Scans */}
      <ScheduledScansSection />

      {/* E-Mail-Empfänger für Scan-Reports */}
      <EmailRecipientsSection />

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-sm text-emerald-800">
          Einstellungen gespeichert
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={pending}
          className="h-12 rounded-full bg-stone-900 px-8 text-sm font-semibold text-white shadow-[0_6px_24px_rgba(68,64,60,0.25)] transition hover:bg-stone-800 disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Einstellungen speichern"}
        </button>
      </div>

      <AdminConsoleGate />
    </div>
  );
}

function PillInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
}: {
  label: string;
  icon: React.ReactNode;
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
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-12 w-full rounded-full border border-white/80 bg-orange-50/70 pl-11 pr-4 text-sm text-stone-800 placeholder:text-stone-400 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md outline-none transition focus:border-stone-400 focus:bg-white/90 disabled:opacity-60"
        />
      </div>
    </div>
  );
}

function PillSelect({
  label,
  icon,
  value,
  onChange,
  options,
  labels,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: string[];
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
          {icon}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-12 w-full appearance-none rounded-full border border-white/80 bg-orange-50/70 pl-11 pr-10 text-sm text-stone-800 shadow-[0_2px_12px_rgba(120,90,60,0.06)] backdrop-blur-md outline-none transition focus:border-stone-400 focus:bg-white/90 disabled:opacity-60"
        >
          {options.map((opt, i) => (
            <option key={opt} value={opt}>
              {labels?.[i] ?? opt}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ScheduledScansSection() {
  const [scans, setScans] = useState<Array<{ id: string; scheduled_at: string; scan_type: string; status: string; notes: string | null; result: unknown }>>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("07:00");
  const [scanType, setScanType] = useState("all");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/scheduled-scans").then((r) => r.json()).then((d) => setScans(d.scans ?? [])).catch(() => {});
  }, []);

  const addScan = () => {
    if (!date) return;
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    startTransition(async () => {
      await fetch("/api/scheduled-scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: scheduledAt, scan_type: scanType, notes: notes.trim() || undefined }),
      });
      setDate("");
      setNotes("");
      const r = await fetch("/api/scheduled-scans");
      setScans((await r.json()).scans ?? []);
    });
  };

  const removeScan = (id: string) => {
    startTransition(async () => {
      await fetch("/api/scheduled-scans", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setScans((prev) => prev.filter((s) => s.id !== id));
    });
  };

  const triggerNow = (id: string) => {
    startTransition(async () => {
      await fetch("/api/scheduled-scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger_id: id }) });
      const r = await fetch("/api/scheduled-scans");
      setScans((await r.json()).scans ?? []);
    });
  };

  const STATUS_STYLE: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900",
    running: "bg-blue-100 text-blue-900",
    completed: "bg-emerald-100 text-emerald-900",
    failed: "bg-rose-100 text-rose-900",
  };

  const TYPE_LABEL: Record<string, string> = { web: "Web", dpma: "DPMA", all: "Web + DPMA" };

  return (
    <section className="glass mt-6 p-6">
      <h2 className="mb-2 text-lg font-semibold text-stone-900">Geplante Scans</h2>
      <p className="mb-4 text-xs text-stone-600">
        Plane Einzel-Scans für bestimmte Termine. Wiederkehrende Scans werden über den Deep-Scan Intervall oben gesteuert.
        Vercel prüft stündlich ob ein Scan fällig ist.
      </p>

      {/* Neuen Scan planen */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 outline-none"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-10 rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 outline-none"
        />
        <select
          value={scanType}
          onChange={(e) => setScanType(e.target.value)}
          className="h-10 appearance-none rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 outline-none"
        >
          <option value="all">Web + DPMA</option>
          <option value="web">Nur Web</option>
          <option value="dpma">Nur DPMA</option>
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notiz (optional)"
          className="h-10 flex-1 rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none"
          onKeyDown={(e) => e.key === "Enter" && addScan()}
        />
        <button
          onClick={addScan}
          disabled={pending || !date}
          className="h-10 rounded-full bg-stone-900 px-5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          Planen
        </button>
      </div>

      {/* Liste geplanter Scans */}
      <div className="space-y-2">
        {scans.length === 0 && (
          <div className="py-4 text-center text-xs text-stone-500">
            Keine geplanten Scans. Wähle oben Datum + Uhrzeit.
          </div>
        )}
        {scans.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border border-white/70 bg-white/60 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-semibold text-stone-900">
                  {new Date(s.scheduled_at).toLocaleDateString("de-DE")} · {new Date(s.scheduled_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-stone-500">
                  <span>{TYPE_LABEL[s.scan_type] ?? s.scan_type}</span>
                  {s.notes && <span>· {s.notes}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[s.status] ?? ""}`}>
                {s.status}
              </span>
              {s.status === "pending" && (
                <>
                  <button onClick={() => triggerNow(s.id)} disabled={pending} className="text-xs text-stone-600 hover:text-stone-900 disabled:opacity-60">
                    Jetzt
                  </button>
                  <button onClick={() => removeScan(s.id)} disabled={pending} className="text-xs text-stone-500 hover:text-rose-700 disabled:opacity-60">
                    Löschen
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DpmaAgentSection() {
  const [open, setOpen] = useState(false);
  const [os, setOs] = useState<"windows" | "mac">("windows");
  const [config, setConfig] = useState<{ NEXT_PUBLIC_SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; GEMINI_API_KEY: string } | null>(null);
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const loadConfig = async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/agent/setup");
      if (!res.ok) throw new Error("Konfiguration konnte nicht geladen werden");
      const data = await res.json();
      setConfig(data.config);
      setAgentToken(data.agentToken ?? null);
      setAppUrl(data.appUrl ?? null);
    } catch (e) {
      setConfigError((e as Error).message);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(!open);
    if (!open && !config) loadConfig();
  };

  // Generiert eine ausführbare Datei die man einfach doppelklickt
  const downloadScript = () => {
    if (!config || !agentToken || !appUrl) return;
    const { NEXT_PUBLIC_SUPABASE_URL: sbUrl, SUPABASE_SERVICE_ROLE_KEY: sbKey, GEMINI_API_KEY: gemKey } = config;
    const repo = "https://github.com/philippgassenmedia-cyber/masters-brand-monitor.git";

    let content: string;
    let filename: string;
    let mimeType: string;

    if (os === "windows") {
      filename = "DPMA-Agent-Starten.bat";
      mimeType = "application/bat";
      content = `@echo off
chcp 65001 >nul
title DPMA Register-Agent
echo.
echo ========================================
echo   DPMA Register-Agent
echo ========================================
echo.

:: Dieses Script muss nur einmal heruntergeladen werden.
:: API-Keys werden automatisch vom Server geholt.
set "APP_URL=${appUrl}"
set "AGENT_TOKEN=${agentToken}"

:: Node.js prüfen — zuerst PATH, dann bekannte Installationspfade
where node >nul 2>&1
if %errorlevel% equ 0 goto :node_ok
if exist "%ProgramFiles%\\nodejs\\node.exe" (
  set "PATH=%ProgramFiles%\\nodejs;%PATH%"
  goto :node_ok
)
if exist "%ProgramFiles(x86)%\\nodejs\\node.exe" (
  set "PATH=%ProgramFiles(x86)%\\nodejs;%PATH%"
  goto :node_ok
)
if exist "%APPDATA%\\nvm\\current\\node.exe" (
  set "PATH=%APPDATA%\\nvm\\current;%PATH%"
  goto :node_ok
)
if exist "%LOCALAPPDATA%\\nvm\\current\\node.exe" (
  set "PATH=%LOCALAPPDATA%\\nvm\\current;%PATH%"
  goto :node_ok
)
echo [FEHLER] Node.js wurde nicht gefunden.
echo Bitte Node.js von https://nodejs.org installieren
echo und dann dieses Fenster neu oeffnen.
echo.
pause
exit /b 1

:node_ok
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

:: Git prüfen
where git >nul 2>&1
if %errorlevel% equ 0 goto :git_ok
if exist "%ProgramFiles%\\Git\\cmd\\git.exe" (
  set "PATH=%ProgramFiles%\\Git\\cmd;%PATH%"
  goto :git_ok
)
if exist "%ProgramFiles(x86)%\\Git\\cmd\\git.exe" (
  set "PATH=%ProgramFiles(x86)%\\Git\\cmd;%PATH%"
  goto :git_ok
)
if exist "%LOCALAPPDATA%\\Programs\\Git\\cmd\\git.exe" (
  set "PATH=%LOCALAPPDATA%\\Programs\\Git\\cmd;%PATH%"
  goto :git_ok
)
echo [FEHLER] Git wurde nicht gefunden.
echo Bitte Git von https://git-scm.com/download/win installieren
echo und dann dieses Fenster neu oeffnen.
echo.
pause
exit /b 1

:git_ok
echo [OK] Git gefunden.

:: Projekt einrichten
if not exist "C:\\dpma-agent\\package.json" (
  echo [1/3] Projekt wird heruntergeladen...
  mkdir "C:\\dpma-agent" 2>nul
  cd /d "C:\\dpma-agent"
  git clone ${repo} .
  echo [2/3] Abhaengigkeiten werden installiert...
  call npm install
) else (
  cd /d "C:\\dpma-agent"
  echo Projekt aktualisieren...
  git pull
  call npm install --silent
)

:: Aktuelle API-Keys vom Server holen (kein Neudownload noetig bei Key-Aenderungen)
echo Lade Konfiguration vom Server...
powershell -NoProfile -Command "$r=try{(Invoke-WebRequest '%APP_URL%/api/agent/config?token=%AGENT_TOKEN%' -UseBasicParsing -TimeoutSec 15).Content | ConvertFrom-Json}catch{$null}; if($r){('set \"SUPABASE_URL='+$r.SUPABASE_URL+'\"'),('set \"SUPABASE_SERVICE_ROLE_KEY='+$r.SUPABASE_SERVICE_ROLE_KEY+'\"'),('set \"GEMINI_API_KEY='+$r.GEMINI_API_KEY+'\"') | Out-File -FilePath $env:TEMP\\agentenv.bat -Encoding ASCII}" 2>nul

if not exist "%TEMP%\\agentenv.bat" (
  echo [WARNUNG] Server nicht erreichbar - verwende gespeicherte Keys.
  set "SUPABASE_URL=${sbUrl}"
  set "SUPABASE_SERVICE_ROLE_KEY=${sbKey}"
  set "GEMINI_API_KEY=${gemKey}"
  goto :start_agent
)
call "%TEMP%\\agentenv.bat"
del "%TEMP%\\agentenv.bat" >nul 2>&1
echo [OK] Konfiguration geladen.

:start_agent
echo.
echo [3/3] Agent wird gestartet...
echo Der Agent wartet auf Scan-Auftraege.
echo Dieses Fenster offen lassen!
echo Zum Stoppen: Strg+C
echo.

call "C:\\dpma-agent\\node_modules\\.bin\\tsx.cmd" scripts\\dpma-agent.ts

pause
`;
    } else {
      filename = "DPMA-Agent-Starten.command";
      mimeType = "application/x-sh";
      content = `#!/bin/bash
# DPMA Register-Agent — Doppelklick zum Starten

echo ""
echo "========================================"
echo "  DPMA Register-Agent"
echo "========================================"
echo ""

# Prüfe Node.js
if ! command -v node &> /dev/null; then
  echo "[FEHLER] Node.js ist nicht installiert."
  echo "Bitte installiere Node.js von https://nodejs.org"
  echo ""
  read -p "Drücke Enter zum Schließen..."
  exit 1
fi

# Prüfe Git
if ! command -v git &> /dev/null; then
  echo "[FEHLER] Git ist nicht installiert."
  echo "Installiere Xcode Command Line Tools: xcode-select --install"
  echo ""
  read -p "Drücke Enter zum Schließen..."
  exit 1
fi

# Projekt herunterladen oder aktualisieren
AGENT_DIR="$HOME/dpma-agent"
if [ ! -f "$AGENT_DIR/package.json" ]; then
  echo "[1/3] Projekt wird heruntergeladen..."
  mkdir -p "$AGENT_DIR"
  cd "$AGENT_DIR"
  git clone ${repo} . 2>/dev/null || git pull 2>/dev/null
  echo "[2/3] Abhängigkeiten werden installiert..."
  npm install
else
  cd "$AGENT_DIR"
  echo "Projekt gefunden. Aktualisiere..."
  git pull 2>/dev/null
  npm install --silent
fi

echo "[3/3] Agent wird gestartet..."
echo ""
echo "Der Agent wartet jetzt auf Scan-Aufträge."
echo "Dieses Fenster offen lassen!"
echo "Zum Stoppen: Ctrl+C oder Fenster schließen."
echo ""

export SUPABASE_URL="${sbUrl}"
export SUPABASE_SERVICE_ROLE_KEY="${sbKey}"
export GEMINI_API_KEY="${gemKey}"
npx tsx scripts/dpma-agent.ts
`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const prereqs = {
    windows: [
      { name: "Google Chrome", url: "https://www.google.com/chrome/" },
      { name: "Node.js (LTS)", url: "https://nodejs.org", hint: "Installer ausführen" },
      { name: "Git", url: "https://git-scm.com/download/win", hint: "Installer ausführen" },
    ],
    mac: [
      { name: "Google Chrome", url: "https://www.google.com/chrome/" },
      { name: "Node.js (LTS)", url: "https://nodejs.org", hint: "Installer ausführen" },
    ],
  };

  return (
    <section className="glass mt-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-stone-900">DPMA Register-Agent</h2>
          <p className="mt-1 text-xs text-stone-600">
            Für die DPMA-Register-Suche wird ein kleines Programm auf deinem Computer benötigt.
            Einmal eingerichtet, kannst du Scans direkt von hier starten.
          </p>
        </div>
        <button
          onClick={handleOpen}
          className="shrink-0 rounded-full border border-white/80 bg-white/60 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-white/90"
        >
          {open ? "Schließen" : "Einrichtung"}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-5">
          {/* OS Switch */}
          <div className="flex items-center gap-1 rounded-full bg-stone-100 p-1 w-fit">
            <button onClick={() => setOs("windows")} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${os === "windows" ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
              Windows
            </button>
            <button onClick={() => setOs("mac")} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${os === "mac" ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              macOS
            </button>
          </div>

          {/* Voraussetzungen */}
          <div className="rounded-xl border border-stone-200/60 bg-white/40 p-4">
            <div className="mb-2 text-sm font-semibold text-stone-900">Voraussetzungen</div>
            <p className="mb-3 text-xs text-stone-600">Folgende Programme müssen einmalig installiert werden:</p>
            <div className="space-y-1.5">
              {prereqs[os].map((p) => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener"
                  className="flex items-center gap-2 rounded-lg border border-white/70 bg-white/50 px-3 py-2 text-xs hover:bg-white/80 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-400">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  <span className="font-semibold text-stone-800">{p.name}</span>
                  {p.hint && <span className="text-stone-400">— {p.hint}</span>}
                </a>
              ))}
            </div>
          </div>

          {/* Agent starten */}
          <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-5">
            <div className="mb-1 text-sm font-semibold text-emerald-900">Agent starten</div>

            {configLoading && (
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
                Wird vorbereitet…
              </div>
            )}
            {configError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-800">
                {configError}
                <button onClick={loadConfig} className="ml-2 font-semibold underline">Erneut versuchen</button>
              </div>
            )}

            {config && os === "windows" && (
              <>
                <p className="mb-4 text-xs text-stone-600">
                  Lade die Startdatei herunter und <strong>doppelklicke</strong> sie.
                  Der Agent installiert sich automatisch und wartet auf Scan-Aufträge.
                </p>
                <button
                  onClick={downloadScript}
                  className="flex items-center gap-2 rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 transition"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {downloaded ? "Heruntergeladen!" : "DPMA-Agent-Starten.bat herunterladen"}
                </button>
              </>
            )}

            {config && os === "mac" && (
              <>
                <p className="mb-3 text-xs text-stone-600">
                  Öffne das <strong>Terminal</strong> (Spotlight → &quot;Terminal&quot;) und füge diesen Befehl ein.
                  Beim ersten Mal wird alles automatisch installiert.
                </p>
                <CodeBlock text={`cd ~/dpma-agent 2>/dev/null || (mkdir -p ~/dpma-agent && cd ~/dpma-agent && git clone https://github.com/philippgassenmedia-cyber/masters-brand-monitor.git . && npm install) && cd ~/dpma-agent && git pull -q && SUPABASE_URL="${config.NEXT_PUBLIC_SUPABASE_URL}" SUPABASE_SERVICE_ROLE_KEY="${config.SUPABASE_SERVICE_ROLE_KEY}" GEMINI_API_KEY="${config.GEMINI_API_KEY}" npx tsx scripts/dpma-agent.ts`} />
                <p className="mt-2 text-[11px] text-stone-500">
                  Terminal-Fenster offen lassen. Zum Stoppen: <kbd className="rounded border border-stone-300 bg-stone-100 px-1 py-0.5 text-[10px] font-semibold">Ctrl+C</kbd>
                </p>
              </>
            )}
          </div>

          {/* Nutzung */}
          <div className="rounded-xl border border-stone-200/60 bg-white/40 p-4">
            <div className="mb-1 text-sm font-semibold text-stone-900">Scan starten</div>
            <p className="text-xs text-stone-600">
              Sobald der Agent läuft, kannst du auf der{" "}
              <a href="/trademarks" className="font-semibold underline">DPMA-Register Seite</a>{" "}
              oder hier unter <strong>Geplante Scans</strong> einen DPMA-Scan starten.
              Der Agent führt ihn automatisch aus.
            </p>
          </div>

          <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-stone-700">
            <strong>Warum lokal?</strong> Das DPMA-Register blockiert Cloud-Zugriffe.
            Der Agent nutzt deinen Chrome-Browser, den das DPMA nicht blockiert.
          </div>
        </div>
      )}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white">{n}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-sm font-semibold text-stone-900">{title}</div>
        <div className="text-xs leading-relaxed text-stone-600">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative mt-1.5">
      <pre className="rounded-lg bg-stone-900 p-2.5 text-[11px] leading-relaxed text-stone-300 overflow-x-auto">{text}</pre>
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute right-2 top-2 rounded bg-stone-700 px-2 py-0.5 text-[9px] text-stone-300 opacity-0 transition hover:bg-stone-600 group-hover:opacity-100"
      >
        {copied ? "Kopiert" : "Kopieren"}
      </button>
    </div>
  );
}

function EmailRecipientsSection() {
  const [recipients, setRecipients] = useState<Array<{ id: string; email: string; name: string | null; aktiv: boolean }>>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/email-recipients")
      .then((r) => r.json())
      .then((d) => setRecipients(d.recipients ?? []))
      .catch(() => {});
  }, []);

  const addRecipient = () => {
    if (!newEmail.trim()) return;
    startTransition(async () => {
      await fetch("/api/email-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || undefined }),
      });
      setNewEmail("");
      setNewName("");
      const r = await fetch("/api/email-recipients");
      const d = await r.json();
      setRecipients(d.recipients ?? []);
    });
  };

  const removeRecipient = (id: string) => {
    startTransition(async () => {
      await fetch("/api/email-recipients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setRecipients((prev) => prev.filter((r) => r.id !== id));
    });
  };

  return (
    <section className="glass mt-6 p-6">
      <h2 className="mb-2 text-lg font-semibold text-stone-900">E-Mail-Benachrichtigungen</h2>
      <p className="mb-4 text-xs text-stone-600">
        Nach jedem automatischen Deep-Scan wird ein Report (PDF + CSV) an alle aktiven Empfänger gesendet.
      </p>

      <div className="space-y-2">
        {recipients.length === 0 && (
          <div className="py-4 text-center text-xs text-stone-500">
            Noch keine Empfänger. Füge unten E-Mail-Adressen hinzu.
          </div>
        )}
        {recipients.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border border-white/70 bg-white/60 px-4 py-2">
            <div>
              <div className="text-sm font-semibold text-stone-900">{r.email}</div>
              {r.name && <div className="text-[11px] text-stone-500">{r.name}</div>}
            </div>
            <button
              onClick={() => removeRecipient(r.id)}
              disabled={pending}
              className="text-xs text-stone-500 hover:text-rose-700 disabled:opacity-60"
            >
              Entfernen
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="E-Mail-Adresse"
          type="email"
          className="h-10 flex-1 rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none"
          onKeyDown={(e) => e.key === "Enter" && addRecipient()}
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name (optional)"
          className="h-10 w-36 rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm text-stone-800 placeholder:text-stone-400 outline-none"
          onKeyDown={(e) => e.key === "Enter" && addRecipient()}
        />
        <button
          onClick={addRecipient}
          disabled={pending || !newEmail.trim()}
          className="h-10 rounded-full bg-stone-900 px-4 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          Hinzufügen
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-stone-700">
        <span className="font-semibold">Gmail-Versand:</span> Trage in den Env-Variablen <code>GMAIL_USER</code> und <code>GMAIL_APP_PASSWORD</code> ein.
      </div>
    </section>
  );
}

// ── Admin Console ────────────────────────────────────────────

type AdminStatus = {
  keys: Record<string, string>;
  keyOverrides: Record<string, boolean>;
  status: {
    gemini: { status: string; latency: number; error: string };
    supabase: { status: string; latency: number; error: string };
  };
  usage30d: Record<string, number>;
  usage7d: Record<string, number>;
};

type TestId = "gemini_basic" | "gemini_grounding" | "gemini_dpma" | "supabase_read" | "supabase_write";
type TestResult = { ok: boolean; message: string; ms: number } | null;

const KEY_LABELS: Record<string, string> = {
  GEMINI_API_KEY: "GEMINI_API_KEY",
  SUPABASE_URL: "SUPABASE_URL",
  SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
};

const USAGE_LABELS_ADMIN: Record<string, string> = {
  gemini_search: "GEMINI_SEARCH",
  gemini_analyze: "GEMINI_ANALYZE",
  gemini_dpma: "GEMINI_DPMA",
  gemini_resolve: "GEMINI_RESOLVE",
  gemini_parse: "GEMINI_PARSE",
};

const TESTS: { id: TestId; label: string; desc: string }[] = [
  { id: "gemini_basic",     label: "GEMINI · BASIC",     desc: "Text-Generation ohne Tools" },
  { id: "gemini_grounding", label: "GEMINI · GROUNDING",  desc: "Google Search Grounding (Paid Tier)" },
  { id: "gemini_dpma",      label: "GEMINI · 2.5 FLASH",  desc: "JSON-Mode mit gemini-2.5-flash" },
  { id: "supabase_read",    label: "SUPABASE · READ",     desc: "SELECT aus settings-Tabelle" },
  { id: "supabase_write",   label: "SUPABASE · WRITE",    desc: "INSERT + DELETE (Testzeile)" },
];

function maskKey(val: string): string {
  if (!val) return "—";
  if (val.length <= 12) return "•".repeat(val.length);
  return val.slice(0, 6) + "•".repeat(Math.min(val.length - 10, 24)) + val.slice(-4);
}

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 20) : 0;
  return (
    <span className="font-mono">
      <span className="text-emerald-500">{"█".repeat(pct)}</span>
      <span className="text-stone-800">{"░".repeat(20 - pct)}</span>
    </span>
  );
}

function AdminConsole({ password, onLock }: { password: string; onLock: () => void }) {
  const [data, setData] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [changePw, setChangePw] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testRunning, setTestRunning] = useState<Record<string, boolean>>({});
  const [section, setSection] = useState<"keys" | "status" | "usage" | "tests">("keys");

  const load = async () => {
    setLoading(true); setFetchError(null);
    try {
      const r = await fetch("/api/admin/status", { headers: { "x-admin-password": password } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setFetchError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const copyKey = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const saveKey = async (key: string) => {
    setEditPending(true); setEditMsg(null);
    try {
      const r = await fetch("/api/admin/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ key, value: editValue }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEditMsg("✓ SAVED"); setEditing(null); await load();
    } catch (e) { setEditMsg(`✗ ${(e as Error).message}`); }
    finally { setEditPending(false); }
  };

  const changePassword = async () => {
    setPwMsg(null);
    try {
      const r = await fetch("/api/admin/verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "Fehler");
      setPwMsg("✓ PASSWORT GEÄNDERT");
      setPwCurrent(""); setPwNew("");
      setTimeout(() => { setChangePw(false); setPwMsg(null); }, 2500);
    } catch (e) { setPwMsg(`✗ ${(e as Error).message}`); }
  };

  const runTest = async (id: TestId) => {
    setTestRunning((p) => ({ ...p, [id]: true }));
    setTestResults((p) => ({ ...p, [id]: null }));
    try {
      const r = await fetch("/api/admin/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ test: id }),
      });
      const d = await r.json();
      setTestResults((p) => ({ ...p, [id]: d }));
    } catch (e) {
      setTestResults((p) => ({ ...p, [id]: { ok: false, message: (e as Error).message, ms: 0 } }));
    } finally {
      setTestRunning((p) => ({ ...p, [id]: false }));
    }
  };

  const runAllTests = () => TESTS.forEach((t) => runTest(t.id));
  const maxUsage = data ? Math.max(1, ...Object.values(data.usage30d)) : 1;

  const NAV: { id: typeof section; label: string }[] = [
    { id: "keys",   label: "API KEYS" },
    { id: "status", label: "STATUS" },
    { id: "usage",  label: "USAGE" },
    { id: "tests",  label: "TESTS" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-950 font-mono text-sm">
      {/* Titlebar */}
      <div className="flex shrink-0 items-center justify-between border-b border-stone-800 bg-stone-950 px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold tracking-[0.25em] text-emerald-400">◈ ADMIN CONSOLE</span>
          <div className="flex gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setSection(n.id)}
                className={`rounded px-3 py-1 text-[10px] font-bold tracking-widest transition ${
                  section === n.id
                    ? "bg-stone-800 text-emerald-400"
                    : "text-stone-600 hover:text-stone-300"
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setChangePw(!changePw)} className="text-[10px] text-stone-600 hover:text-amber-400 tracking-widest">
            {changePw ? "✗ CANCEL" : "PW ÄNDERN"}
          </button>
          <button onClick={load} className="text-[10px] text-stone-600 hover:text-emerald-400 tracking-widest">⟳ REFRESH</button>
          <button onClick={onLock} className="text-[10px] text-rose-800 hover:text-rose-400 tracking-widest">■ LOCK</button>
        </div>
      </div>

      {/* Change-PW bar */}
      {changePw && (
        <div className="shrink-0 flex items-center gap-3 border-b border-stone-800 bg-stone-900/80 px-6 py-2.5">
          <span className="text-[10px] tracking-widest text-stone-500">NEW PASSWORD</span>
          <input type="password" placeholder="Aktuelles PW" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
            className="h-7 rounded border border-stone-700 bg-stone-950 px-3 text-xs text-stone-200 outline-none focus:border-emerald-600" />
          <input type="password" placeholder="Neues PW" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
            className="h-7 rounded border border-stone-700 bg-stone-950 px-3 text-xs text-stone-200 outline-none focus:border-emerald-600" />
          <button onClick={changePassword} className="h-7 rounded bg-emerald-800 px-4 text-[10px] font-bold text-white hover:bg-emerald-700">SAVE</button>
          {pwMsg && <span className={`text-[10px] ${pwMsg.startsWith("✓") ? "text-emerald-400" : "text-rose-400"}`}>{pwMsg}</span>}
        </div>
      )}

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {loading && <div className="animate-pulse text-xs text-stone-600">LOADING…</div>}
        {fetchError && <div className="text-xs text-rose-400">✗ {fetchError}</div>}

        {/* ── API KEYS ── */}
        {section === "keys" && data && (
          <div className="max-w-3xl space-y-3">
            <div className="mb-4 text-[10px] tracking-[0.25em] text-stone-600">// API KEYS — EDIT speichert DB-Override (überschreibt ENV)</div>
            {Object.entries(KEY_LABELS).map(([key, label]) => {
              const val = data.keys[key] ?? "";
              const isOverride = data.keyOverrides[key];
              const isRevealed = revealed[key];
              const isEditing = editing === key;
              return (
                <div key={key} className="rounded border border-stone-800 bg-stone-900 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-widest text-stone-400">{label}</span>
                    {isOverride
                      ? <span className="rounded bg-amber-900/40 px-2 py-0.5 text-[9px] font-bold text-amber-400 tracking-widest">DB OVERRIDE</span>
                      : <span className="rounded bg-stone-800 px-2 py-0.5 text-[9px] text-stone-600 tracking-widest">ENV</span>
                    }
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus type="text" defaultValue={val} onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 flex-1 rounded border border-stone-700 bg-stone-950 px-3 text-xs text-emerald-300 outline-none focus:border-emerald-500"
                        placeholder="Leer → ENV-Variable verwenden" />
                      <button onClick={() => saveKey(key)} disabled={editPending}
                        className="h-8 rounded bg-emerald-800 px-4 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {editPending ? "…" : "SAVE"}
                      </button>
                      <button onClick={() => setEditing(null)} className="h-8 px-2 text-[10px] text-stone-600 hover:text-stone-300">✗</button>
                      {editMsg && <span className={`text-[10px] ${editMsg.startsWith("✓") ? "text-emerald-400" : "text-rose-400"}`}>{editMsg}</span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="flex-1 truncate text-xs text-amber-300/70">
                        <span className="mr-2 text-stone-700">›</span>
                        {isRevealed ? (val || "—") : maskKey(val)}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        {[
                          { label: isRevealed ? "HIDE" : "SHOW", action: () => setRevealed((r) => ({ ...r, [key]: !r[key] })), color: "hover:text-stone-200" },
                          { label: copied === key ? "✓" : "COPY", action: () => copyKey(key, val), color: "hover:text-emerald-400" },
                          { label: "EDIT", action: () => { setEditing(key); setEditValue(val); setEditMsg(null); }, color: "hover:text-amber-400" },
                        ].map((btn) => (
                          <button key={btn.label} onClick={btn.action}
                            className={`rounded border border-stone-800 px-2 py-1 text-[9px] font-bold text-stone-600 transition ${btn.color}`}>
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── STATUS ── */}
        {section === "status" && data && (
          <div className="max-w-2xl space-y-2">
            <div className="mb-4 text-[10px] tracking-[0.25em] text-stone-600">// SYSTEM STATUS</div>
            {[
              { id: "gemini",   label: "GEMINI_API",   s: data.status.gemini },
              { id: "supabase", label: "SUPABASE_DB",  s: data.status.supabase },
            ].map(({ id, label, s }) => (
              <div key={id} className="flex items-start gap-4 rounded border border-stone-800 bg-stone-900 px-4 py-3">
                <span className={`mt-0.5 text-lg leading-none ${s.status === "online" ? "text-emerald-500" : "text-rose-500"}`}>●</span>
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <span className="w-32 text-xs font-bold text-stone-300">{label}</span>
                    <span className={`text-xs font-bold tracking-widest ${s.status === "online" ? "text-emerald-400" : "text-rose-400"}`}>
                      {s.status.toUpperCase()}
                    </span>
                    <span className="text-xs text-stone-600">{s.latency}ms</span>
                  </div>
                  {s.error && <div className="mt-1 text-[11px] text-rose-600">{s.error}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── USAGE ── */}
        {section === "usage" && data && (
          <div className="max-w-2xl">
            <div className="mb-4 text-[10px] tracking-[0.25em] text-stone-600">// API USAGE — 30D / 7D</div>
            <div className="space-y-2">
              {Object.entries(USAGE_LABELS_ADMIN).map(([provider, label]) => {
                const v30 = data.usage30d[provider] ?? 0;
                const v7 = data.usage7d[provider] ?? 0;
                return (
                  <div key={provider} className="flex items-center gap-4 rounded border border-stone-800 bg-stone-900 px-4 py-2.5">
                    <span className="w-36 text-[10px] font-bold tracking-widest text-stone-500">{label}</span>
                    <UsageBar value={v30} max={maxUsage} />
                    <span className="w-20 text-right text-xs tabular-nums text-amber-300/70">{v30.toLocaleString("de-DE")}</span>
                    <span className="text-[10px] text-stone-700">7d: {v7.toLocaleString("de-DE")}</span>
                  </div>
                );
              })}
              {Object.keys(USAGE_LABELS_ADMIN).every((k) => !data.usage30d[k]) && (
                <div className="text-xs text-stone-700">Keine API-Calls in den letzten 30 Tagen.</div>
              )}
            </div>
          </div>
        )}

        {/* ── TESTS ── */}
        {section === "tests" && (
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-4">
              <span className="text-[10px] tracking-[0.25em] text-stone-600">// API TESTS</span>
              <button onClick={runAllTests}
                className="rounded border border-stone-700 px-3 py-1 text-[10px] font-bold text-stone-500 hover:border-emerald-700 hover:text-emerald-400 tracking-widest">
                ▶ RUN ALL
              </button>
            </div>
            <div className="space-y-2">
              {TESTS.map((t) => {
                const res = testResults[t.id] ?? null;
                const running = testRunning[t.id] ?? false;
                return (
                  <div key={t.id} className="rounded border border-stone-800 bg-stone-900 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <span className={`w-2 text-base leading-none ${
                        running ? "animate-pulse text-amber-400"
                        : res === null ? "text-stone-700"
                        : res.ok ? "text-emerald-500" : "text-rose-500"
                      }`}>●</span>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-3">
                          <span className="text-[11px] font-bold tracking-widest text-stone-300">{t.label}</span>
                          <span className="text-[10px] text-stone-600">{t.desc}</span>
                        </div>
                        {res && (
                          <div className={`mt-1 text-[11px] ${res.ok ? "text-emerald-400" : "text-rose-400"}`}>
                            <span className="mr-2">{res.ok ? "✓" : "✗"}</span>
                            <span>{res.message}</span>
                            <span className="ml-2 text-stone-600">{res.ms}ms</span>
                          </div>
                        )}
                        {running && <div className="mt-1 animate-pulse text-[11px] text-amber-500">RUNNING…</div>}
                      </div>
                      <button
                        onClick={() => runTest(t.id)}
                        disabled={running}
                        className="rounded border border-stone-700 px-3 py-1 text-[10px] font-bold text-stone-600 hover:border-emerald-700 hover:text-emerald-400 disabled:opacity-40 tracking-widest"
                      >
                        {running ? "…" : "▶ RUN"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Statusbar */}
      <div className="shrink-0 flex items-center justify-between border-t border-stone-800 bg-stone-950 px-6 py-2">
        <span className="text-[10px] text-stone-700">
          {data ? `SUPABASE ${data.status.supabase.status.toUpperCase()} · GEMINI ${data.status.gemini.status.toUpperCase()}` : "—"}
        </span>
        <span className="text-[10px] text-stone-700">Brand Monitor Admin Console</span>
      </div>
    </div>
  );
}

function AdminConsoleGate() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [setupDone, setSetupDone] = useState(false);

  const unlock = async () => {
    setPending(true); setError(null);
    try {
      const r = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: input }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "Falsches Passwort");
      setPassword(input);
      setSetupDone(d.setup ?? false);
      setOpen(true);
      setInput("");
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  };

  if (open && password) {
    return <AdminConsole password={password} onLock={() => { setOpen(false); setPassword(""); }} />;
  }

  return (
    <div className="mt-12 flex flex-col items-center gap-3 border-t border-stone-100 pt-8">
      <span className="text-[10px] uppercase tracking-[0.25em] text-stone-300">System</span>
      <form onSubmit={(e) => { e.preventDefault(); unlock(); }} className="flex items-center gap-2">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Admin-Passwort…"
          className="h-8 w-52 rounded-full border border-stone-200 bg-white/50 px-4 text-xs text-stone-700 outline-none focus:border-stone-400"
        />
        <button type="submit" disabled={pending || !input}
          className="h-8 rounded-full border border-stone-200 bg-white/60 px-4 text-xs font-medium text-stone-600 transition hover:bg-white/90 disabled:opacity-50">
          {pending ? "…" : "Entsperren"}
        </button>
      </form>
      {setupDone && <p className="text-[11px] text-emerald-600">Admin-Passwort gesetzt.</p>}
      {error && <p className="text-[11px] text-rose-500">{error}</p>}
      <p className="text-[10px] text-stone-300">Erster Aufruf setzt das Passwort.</p>
    </div>
  );
}
