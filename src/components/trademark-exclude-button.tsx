"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function TrademarkExcludeButton({
  trademarkId,
  markenname,
}: {
  trademarkId: string;
  markenname: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`"${markenname}" als eigene Marke markieren?\n\nDer Eintrag wird aus der Standardansicht entfernt.`)) return;
        startTransition(async () => {
          const res = await fetch(`/api/dpma/trademarks/${trademarkId}/exclude`, { method: "POST" });
          if (res.ok) router.refresh();
          else alert("Fehler beim Markieren");
        });
      }}
      className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
      title="Als eigene Marke markieren"
    >
      {pending ? "…" : "Eigen"}
    </button>
  );
}
