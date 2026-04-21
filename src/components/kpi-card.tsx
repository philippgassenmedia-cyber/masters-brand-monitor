import Link from "next/link";
import { Sparkline } from "./sparkline";

type Tone = "slate" | "red" | "amber" | "emerald" | "brand";

// Abgestimmt: gedämpfte, seriöse Palette — Farben kommen nur minimal durch,
// die Glass-Cards dominieren.
const TONES: Record<Tone, { text: string; accent: string; ring: string }> = {
  slate: { text: "text-stone-900", accent: "#78716c", ring: "ring-stone-200/50" },
  red: { text: "text-rose-900", accent: "#9f1239", ring: "ring-rose-200/40" },
  amber: { text: "text-amber-900", accent: "#a16207", ring: "ring-amber-200/40" },
  emerald: { text: "text-emerald-900", accent: "#047857", ring: "ring-emerald-200/40" },
  brand: { text: "text-stone-900", accent: "#9a6b3f", ring: "ring-stone-200/50" },
};

export function KpiCard({
  label,
  value,
  href,
  tone = "slate",
  hint,
  trend,
  trendLabel,
}: {
  label: string;
  value: string | number;
  href?: string;
  tone?: Tone;
  hint?: string;
  trend?: number[];
  trendLabel?: string;
}) {
  const t = TONES[tone];
  const inner = (
    <div
      className={`glass ring-1 ${t.ring} flex h-full min-w-0 flex-col overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(120,90,60,0.12)]`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold leading-none tracking-tight ${t.text}`}>
        {value}
      </div>
      <div className="mt-1 min-h-[14px] text-[10px] text-stone-500">{hint ?? ""}</div>
      <div className="mt-auto pt-3">
        <div className="h-9 w-full">
          {trend && trend.length > 1 && (
            <Sparkline data={trend} color={t.accent} width={160} height={36} />
          )}
        </div>
        <div className="mt-1 min-h-[12px] text-[10px] font-medium text-stone-500">
          {trendLabel ?? ""}
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
