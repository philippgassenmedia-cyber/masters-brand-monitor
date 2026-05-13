"use client";

import { useState } from "react";

export function WebsitePreview({ url }: { url: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  // thum.io: free screenshot thumbnail service, no API key needed for basic use
  const screenshotUrl = `https://image.thum.io/get/width/800/crop/500/${url}`;

  return (
    <section className={`glass overflow-hidden transition-all ${state === "error" ? "hidden" : ""}`}>
      <div className="border-b border-white/60 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">Webseiten-Vorschau</h2>
      </div>
      <div className="relative">
        {state === "loading" && (
          <div className="flex items-center justify-center py-8 text-xs text-stone-400 animate-pulse">
            Lade Vorschau…
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshotUrl}
          alt="Webseiten-Vorschau"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={`w-full rounded-b-2xl transition-opacity duration-300 ${state === "loaded" ? "opacity-100" : "opacity-0 h-0"}`}
        />
      </div>
    </section>
  );
}
