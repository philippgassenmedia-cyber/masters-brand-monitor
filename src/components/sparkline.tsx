interface Props {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  color = "#f97316",
  height = 48,
  width = 160,
  fill = true,
  className,
}: Props) {
  if (!data.length) {
    return <svg className={className} />;
  }
  // Padding innerhalb der viewBox, damit der End-Punkt-Kreis (r=3) + Stroke-Linie
  // nicht am Rand abgeschnitten wird.
  const PAD = 4;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = innerW / Math.max(data.length - 1, 1);

  const points = data.map((v, i) => {
    const x = PAD + i * stepX;
    const y = PAD + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(width - PAD).toFixed(1)},${height - PAD} L${PAD},${height - PAD} Z`;
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`block h-auto w-full ${className ?? ""}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradId})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r="3"
          fill={color}
          stroke="#fff"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}
