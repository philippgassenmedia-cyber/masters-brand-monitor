"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteHitButton({
  hitId,
  redirectAfter = false,
}: {
  hitId: string;
  redirectAfter?: boolean;
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
        if (!confirm("Diesen Treffer löschen?\n\nDer Eintrag wird endgültig aus der Datenbank entfernt."))
          return;
        startTransition(async () => {
          const res = await fetch(`/api/hits/${hitId}`, { method: "DELETE" });
          if (res.ok) {
            if (redirectAfter) router.push("/");
            else router.refresh();
          } else {
            alert("Fehler beim Löschen");
          }
        });
      }}
      className="rounded-full border border-rose-200 bg-white/70 px-3 py-1 text-[11px] font-medium text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-40 transition"
      title="Treffer endgültig löschen"
    >
      {pending ? "…" : "Löschen"}
    </button>
  );
}
