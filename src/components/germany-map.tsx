"use client";

import { useEffect, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";

export type CityState = "idle" | "active" | "done";

export interface ScanCity {
  name: string;
  lat: number;
  lng: number;
}

interface GermanyMapProps {
  cities: ScanCity[];
  states: Record<string, CityState>;
  hitCount: Record<string, number>;
}

const DOT_COLORS: Record<CityState, string> = {
  idle: "#a8a29e",
  active: "#a855f7",
  done: "#22c55e",
};

export function GermanyMap({ cities, states, hitCount }: GermanyMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [geoData, setGeoData] = useState<GeoPermissibleObjects | null>(null);

  useEffect(() => {
    fetch("/germany-outline.geo.json")
      .then((r) => r.json())
      .then((data) => setGeoData(data as GeoPermissibleObjects))
      .catch(() => {
        // GeoJSON not available
      });
  }, []);

  const width = 300;
  const height = 400;

  const projection = geoMercator()
    .center([10.4, 51.1])
    .scale(2200)
    .translate([width / 2, height / 2]);

  const pathGenerator = geoPath().projection(projection);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      style={{ maxHeight: "400px" }}
    >
      {/* Background */}
      <rect width={width} height={height} fill="transparent" />

      {/* Germany outline */}
      {geoData && (
        <path
          d={pathGenerator(geoData) ?? ""}
          fill="rgba(214, 211, 209, 0.3)"
          stroke="rgba(168, 162, 158, 0.5)"
          strokeWidth={0.5}
        />
      )}

      {/* City dots */}
      {cities.map((city) => {
        const state = states[city.name] ?? "idle";
        const hits = hitCount[city.name] ?? 0;
        const [cx, cy] = projection([city.lng, city.lat]) ?? [0, 0];
        const color = DOT_COLORS[state];
        const r = Math.max(3, Math.min(8, 3 + hits * 0.5));

        return (
          <g key={city.name}>
            {/* Pulse animation for active */}
            {state === "active" && (
              <>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 6}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  opacity={0.4}
                >
                  <animate
                    attributeName="r"
                    from={String(r + 2)}
                    to={String(r + 12)}
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.6"
                    to="0"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 3}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth={1}
                  opacity={0.3}
                >
                  <animate
                    attributeName="r"
                    from={String(r)}
                    to={String(r + 8)}
                    dur="1.5s"
                    begin="0.3s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.5"
                    to="0"
                    dur="1.5s"
                    begin="0.3s"
                    repeatCount="indefinite"
                  />
                </circle>
              </>
            )}

            {/* Main dot */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={color}
              stroke="white"
              strokeWidth={1}
              className="transition-all duration-300"
            />

            {/* Hit count label */}
            {hits > 0 && (
              <text
                x={cx}
                y={cy + r + 10}
                textAnchor="middle"
                fontSize={8}
                fill="#57534e"
                fontWeight={600}
              >
                {hits}
              </text>
            )}

            {/* City name tooltip */}
            <title>
              {city.name}
              {hits > 0 ? ` (${hits} Treffer)` : ""}
            </title>
          </g>
        );
      })}
    </svg>
  );
}
