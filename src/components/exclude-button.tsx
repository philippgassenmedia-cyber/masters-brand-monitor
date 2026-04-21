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
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
      title="Als eigene Marke markieren"
    >
      {pending ? "…" : "Eigen"}
    </button>
  );
}
