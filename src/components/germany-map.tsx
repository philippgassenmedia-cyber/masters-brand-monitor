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
  idle: "#d6d3d1",
  active: "#f59e0b",
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

  const width = 220;
  const height = 320;

  const projection = geoMercator()
    .center([10.3, 51.2])
    .scale(1350)
    .translate([width / 2, height / 2]);

  const pathGenerator = geoPath().projection(projection);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      style={{ maxHeight: "100%", display: "block" }}
    >
      {/* Background */}
      <rect width={width} height={height} fill="transparent" />

      {/* Germany outline */}
      {geoData ? (
        <path
          d={pathGenerator(geoData) ?? ""}
          fill="rgba(214, 211, 209, 0.25)"
          stroke="rgba(120, 113, 108, 0.6)"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      ) : (
        /* Fallback: Bounding-Box wenn GeoJSON noch nicht geladen */
        <rect x={10} y={10} width={width - 20} height={height - 20} rx={4}
          fill="rgba(214,211,209,0.15)" stroke="rgba(168,162,158,0.3)" strokeWidth={0.5} />
      )}

      {/* City dots */}
      {cities.map((city) => {
        const state = states[city.name] ?? "idle";
        const hits = hitCount[city.name] ?? 0;
        const [cx, cy] = projection([city.lng, city.lat]) ?? [0, 0];
        const color = DOT_COLORS[state];
        const r = state === "idle" ? 2.5 : Math.max(3.5, Math.min(7, 3.5 + hits * 0.6));

        return (
          <g key={city.name}>
            {/* Outer glow for active cities */}
            {state === "active" && (
              <>
                <circle cx={cx} cy={cy} r={r} fill="#f59e0b" opacity={0.15}>
                  <animate attributeName="r" from={String(r)} to={String(r + 10)} dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.4" to="0" dur="1.2s" repeatCount="indefinite" />
                </circle>
                <circle cx={cx} cy={cy} r={r} fill="#f59e0b" opacity={0.2}>
                  <animate attributeName="r" from={String(r)} to={String(r + 6)} dur="1.2s" begin="0.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.5" to="0" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
                </circle>
              </>
            )}

            {/* Glow halo for cities with hits */}
            {state === "done" && hits > 0 && (
              <circle
                cx={cx}
                cy={cy}
                r={r + 3}
                fill="#22c55e"
                opacity={0.2}
              />
            )}

            {/* Main dot */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={color}
              stroke={state === "idle" ? "none" : "white"}
              strokeWidth={state === "idle" ? 0 : 1}
              className="transition-all duration-300"
            />

            {/* Hit count badge */}
            {hits > 0 && (
              <>
                <circle cx={cx + r + 1} cy={cy - r - 1} r={5} fill="#22c55e" />
                <text
                  x={cx + r + 1}
                  y={cy - r + 2}
                  textAnchor="middle"
                  fontSize={6}
                  fill="white"
                  fontWeight={700}
                >
                  {hits > 9 ? "9+" : hits}
                </text>
              </>
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
