"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

const RATINGS = [
  { value: "correct", label: "Korrekt", emoji: "✅", desc: "Score war passend" },
  { value: "too_high", label: "Zu hoch", emoji: "⬇️", desc: "KI hat überbewertet" },
  { value: "too_low", label: "Zu niedrig", emoji: "⬆️", desc: "KI hat unterbewertet" },
  { value: "false_positive", label: "Fehlalarm", emoji: "❌", desc: "Kein echter Treffer" },
  { value: "missed", label: "Übersehen", emoji: "🔍", desc: "Hätte höher bewertet werden müssen" },
] as const;

interface FeedbackEntry {
  id: string;
  rating: string;
  correct_score: number | null;
  comment: string | null;
  created_by: string | null;
  created_at: string;
}

export function FeedbackForm({
  itemType,
  itemId,
  currentScore,
}: {
  itemType: "hit" | "trademark";
  itemId: string;
  currentScore: number | null;
}) {
  const [rating, setRating] = useState<string | null>(null);
  const [correctScore, setCorrectScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<FeedbackEntry[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/feedback?item_type=${itemType}&item_id=${itemId}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.feedback ?? []))
      .catch(() => {});
  }, [itemType, itemId]);

  const submit = () => {
    if (!rating) return;
    setSaved(false);
    startTransition(async () => {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: itemType,
          item_id: itemId,
          rating,
          correct_score: correctScore,
          comment: comment.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setRating(null);
        setCorrectScore(null);
        setComment("");
        // History neu laden
        const r = await fetch(`/api/feedback?item_type=${itemType}&item_id=${itemId}`);
        const d = await r.json();
        setHistory(d.feedback ?? []);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  return (
    <section className="glass mt-6 p-6">
      <h2 className="mb-4 text-lg font-semibold text-stone-900">Feedback zur KI-Bewertung</h2>
      <p className="mb-4 text-xs text-stone-600">
        Dein Feedback verbessert zukünftige Bewertungen. KI-Score war: <strong>{currentScore ?? "—"}/10</strong>
      </p>

      {/* Rating-Auswahl */}
      <div className="mb-4 flex flex-wrap gap-2">
        {RATINGS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRating(r.value)}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition ${
              rating === r.value
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-white/80 bg-white/60 text-stone-700 hover:bg-white/90"
            }`}
          >
            <span>{r.emoji}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      {/* Korrekter Score */}
      {(rating === "too_high" || rating === "too_low" || rating === "missed") && (
        <div className="mb-4">
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
            Was wäre der korrekte Score? (0-10)
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCorrectScore(i)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition ${
                  correctScore === i
                    ? i >= 7
                      ? "bg-rose-500 text-white"
                      : i >= 4
                        ? "bg-amber-500 text-white"
                        : "bg-emerald-500 text-white"
                    : "bg-white/60 text-stone-700 hover:bg-white/90"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Kommentar */}
      {rating && (
        <div className="mb-4">
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-stone-500">
            Hinweis (optional)
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="z.B. 'Diese Firma ist in einer ganz anderen Branche' oder 'Klarer Immobilienmakler mit Master im Namen'"
            className="w-full resize-none rounded-2xl border border-white/80 bg-orange-50/70 px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 outline-none"
          />
        </div>
      )}

      {rating && (
        <button
          onClick={submit}
          disabled={pending}
          className="h-10 rounded-full bg-stone-900 px-6 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Feedback senden"}
        </button>
      )}

      {saved && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-sm text-emerald-800">
          Feedback gespeichert — wird bei zukünftigen Bewertungen berücksichtigt.
        </div>
      )}

      {/* Bisheriges Feedback */}
      {history.length > 0 && (
        <div className="mt-5 border-t border-white/60 pt-4">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-stone-500">
            Bisheriges Feedback · {history.length}
          </div>
          <div className="space-y-2">
            {history.map((f) => (
              <div key={f.id} className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-900">
                    {RATINGS.find((r) => r.value === f.rating)?.emoji}{" "}
                    {RATINGS.find((r) => r.value === f.rating)?.label}
                    {f.correct_score !== null && ` → Score ${f.correct_score}`}
                  </span>
                  <span className="text-stone-500">
                    {new Date(f.created_at).toLocaleDateString("de-DE")}
                  </span>
                </div>
                {f.comment && <div className="mt-1 text-stone-600">{f.comment}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
