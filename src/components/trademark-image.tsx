"use client";

import { useState } from "react";

function buildImageUrl(aktenzeichen: string, quelle: string | null | undefined): string | null {
  const isEuipo = (quelle ?? "").toLowerCase().includes("euipo");

  if (isEuipo) {
    const digits = aktenzeichen.replace(/\D/g, "");
    if (!digits) return null;
    return `https://euipo.europa.eu/copla/trademark/${digits}/IMAGE/image.jpg`;
  }

  // DPMA: digits only, drop class part after "/"
  const baseAkz = aktenzeichen.split("/")[0].replace(/\D/g, "");
  if (!baseAkz) return null;
  return `https://register.dpma.de/DPMAregister/marke/billzeichen?AKZ=${baseAkz}`;
}

export function TrademarkImage({
  aktenzeichen,
  quelle,
  markenname,
}: {
  aktenzeichen: string;
  quelle?: string | null;
  markenname: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const imageUrl = buildImageUrl(aktenzeichen, quelle);

  if (!imageUrl || state === "error") return null;

  return (
    <section className="glass p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500">Bildmarke</h2>
      <div className="flex min-h-[80px] items-center justify-center rounded-xl border border-white/60 bg-white/80 p-4">
        {state === "loading" && (
          <span className="animate-pulse text-xs text-stone-400">Lade Markenbild…</span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`Bildmarke: ${markenname}`}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={`max-h-40 max-w-full object-contain transition-opacity duration-300 ${state === "loaded" ? "opacity-100" : "opacity-0 h-0"}`}
        />
      </div>
    </section>
  );
}
