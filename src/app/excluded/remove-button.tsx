"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RemoveButton({ domain }: { domain: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Domain "${domain}" wirklich von der Ausschlussliste entfernen?\n\nZukünftige Treffer dieser Domain werden wieder angezeigt.`,
          )
        )
          return;
        startTransition(async () => {
          const res = await fetch(`/api/excluded/${encodeURIComponent(domain)}`, {
            method: "DELETE",
          });
          if (res.ok) {
            router.refresh();
          } else {
            alert("Fehler beim Entfernen");
          }
        });
      }}
      className="rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-[10px] font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
    >
      {pending ? "…" : "Entfernen"}
    </button>
  );
}
