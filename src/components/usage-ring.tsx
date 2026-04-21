export function UsageRing({
  count,
  limit,
  label = "Gemini Credits",
}: {
  count: number;
  limit: number;
  label?: string;
}) {
  const remaining = Math.max(0, limit - count);
  const pct = Math.min(1, count / limit);
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * pct;

  const color =
    pct >= 0.9 ? "#9f1239" : pct >= 0.7 ? "#a16207" : "#a8a29e";

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 56 56" className="h-12 w-12 -rotate-90">
          <circle cx="28" cy="28" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="5" />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 400ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-stone-800">
          {remaining}
        </div>
      </div>
      <div className="min-w-0 text-[11px] text-stone-600">
        <div className="truncate font-semibold text-stone-800">{label}</div>
        <div>verbleibend</div>
      </div>
    </div>
  );
}
