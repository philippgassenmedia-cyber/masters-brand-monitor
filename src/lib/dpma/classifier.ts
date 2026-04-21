import { z } from "zod";
import { trackGeminiCall } from "../gemini-usage";
import type { DpmaKurierHit, TrademarkPriority } from "./types";
import type { MatchResult } from "./matching";

const IMMOBILIEN_KLASSEN = new Set([35, 36, 37, 42, 43]);

// Gemini antwortet manchmal auf Deutsch — wir mappen flexibel
function normalizePriority(raw: string): TrademarkPriority {
  const lower = raw.toLowerCase().trim();
  if (["critical", "kritisch"].includes(lower)) return "critical";
  if (["high", "hoch"].includes(lower)) return "high";
  if (["medium", "mittel"].includes(lower)) return "medium";
  return "low";
}

const ScoreSchema = z.object({
  score: z.number().int().min(0).max(10),
  branchenbezug: z.string().min(1),
  prioritaet: z.string().transform(normalizePriority),
  begruendung: z.string().min(1),
});

const SYSTEM_PROMPT = `Du bist ein Markenrechts-Analyst. Bewerte einen neuen DPMA-Markentreffer
auf Relevanz für den Inhaber der Wortmarke "MASTER" im Immobilien-Kontext.

Kontext: Der Markeninhaber überwacht das DPMA-Register nach neuen Markenanmeldungen,
die seiner Marke "MASTER" ähnlich sind und im Immobilien-/Bau-/Hausverwaltungsbereich
liegen könnten. Eine Marke mit hoher Ähnlichkeit + Immobilien-Bezug = hohe Priorität.

Score 0-10:
  9-10 = critical: Identischer/fast identischer Name, klar Immobilien-Kontext
  7-8  = high: Sehr ähnlicher Name oder Wortverbindung, Immobilien-Bezug vorhanden
  5-6  = medium: Ähnlich, aber anderer Kontext oder nur teilweiser Bezug
  3-4  = low: Entfernter Bezug, wahrscheinlich irrelevant
  0-2  = keine Relevanz

Antworte NUR mit JSON:
{"score": <0-10>, "branchenbezug": "<Branche der angemeldeten Marke>", "prioritaet": "<low|medium|high|critical>", "begruendung": "<2-3 Sätze>"}`;

export interface ClassificationResult {
  score: number;
  branchenbezug: string;
  prioritaet: TrademarkPriority;
  begruendung: string;
}

export async function classifyTrademark(
  hit: DpmaKurierHit,
  match: MatchResult,
): Promise<ClassificationResult> {
  // class_only Treffer: kein Gemini-Call, Default-Werte
  if (match.type === "class_only") {
    const hasImmoClass = hit.nizza_klassen.some((k) => IMMOBILIEN_KLASSEN.has(k));
    return {
      score: 0,
      branchenbezug: hasImmoClass ? "Immobilien-relevante Klasse" : "Unbekannt",
      prioritaet: "low",
      begruendung: "Kein Name-Match zum Markenstamm. Nur durch Klassenzugehörigkeit erfasst.",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const hasImmoClass = hit.nizza_klassen.some((k) => IMMOBILIEN_KLASSEN.has(k));
  const prompt = [
    `Markenname: ${hit.markenname}`,
    `Aktenzeichen: ${hit.aktenzeichen}`,
    hit.anmelder ? `Anmelder: ${hit.anmelder}` : "",
    `Nizza-Klassen: ${hit.nizza_klassen.join(", ") || "keine"}`,
    `Immobilien-relevante Klasse enthalten: ${hasImmoClass ? "JA" : "NEIN"}`,
    hit.status ? `Status: ${hit.status}` : "",
    `Match-Typ gegen Stamm "${match.stem}": ${match.type} — ${match.details}`,
  ]
    .filter(Boolean)
    .join("\n");

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20_000);

  try {
    await trackGeminiCall("gemini_dpma");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Gemini ${res.status}`);

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const parsed = ScoreSchema.parse(JSON.parse(text));

    // Boosting basierend auf Match-Typ + Immobilien-Klassen
    if (match.type === "exact") {
      parsed.score = Math.max(parsed.score, 8);
      if (hasImmoClass) { parsed.score = Math.max(parsed.score, 9); parsed.prioritaet = "critical"; }
      else parsed.prioritaet = parsed.prioritaet === "low" ? "high" : parsed.prioritaet;
    } else if (match.type === "compound") {
      parsed.score = Math.max(parsed.score, 6);
      if (hasImmoClass) { parsed.score = Math.max(parsed.score, 8); parsed.prioritaet = "high"; }
    } else if (match.type === "fuzzy" || match.type === "phonetic") {
      parsed.score = Math.max(parsed.score, 5);
      if (hasImmoClass) { parsed.score = Math.max(parsed.score, 7); parsed.prioritaet = "high"; }
    }
    if (hasImmoClass && parsed.prioritaet === "low") parsed.prioritaet = "medium";

    return parsed;
  } catch (e) {
    clearTimeout(timeout);
    const fallbackScore = match.type === "exact" ? (hasImmoClass ? 9 : 8)
      : match.type === "compound" ? (hasImmoClass ? 8 : 6)
      : match.type === "fuzzy" || match.type === "phonetic" ? (hasImmoClass ? 7 : 5)
      : 3;
    return {
      score: fallbackScore,
      branchenbezug: hasImmoClass ? "Immobilien-relevante Klasse" : "Nicht bewertet (Gemini-Fehler)",
      prioritaet: match.type === "exact" ? "critical" : hasImmoClass ? "high" : "medium",
      begruendung: `Automatische Bewertung (Gemini nicht verfügbar): ${(e as Error).message}`,
    };
  }
}
