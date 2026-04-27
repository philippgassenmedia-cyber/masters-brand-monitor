"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ExcludeButton({ hitId, domain }: { hitId: string; domain: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (
          !confirm(
            `Domain "${domain}" als eigene Marke markieren?\n\nAlle bestehenden und zukünftigen Treffer dieser Domain werden entfernt.`,
          )
        )
          return;
        startTransition(async () => {
          const res = await fetch(`/api/hits/${hitId}/exclude`, { method: "POST" });
          if (res.ok) router.refresh();
          else alert("Fehler beim Ausschließen");
        });
      }}
      className="rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-stone-600 hover:border-stone-300 hover:bg-white hover:text-stone-900 disabled:opacity-40 transition"
      title="Als eigene Marke markieren — entfernt alle Treffer dieser Domain"
    >
      {pending ? "…" : "Eigene Marke"}
    </button>
  );
}
