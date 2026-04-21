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
