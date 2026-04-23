import { z } from "zod";
import { trackGeminiCall } from "../gemini-usage";
import type { DpmaKurierHit, TrademarkPriority } from "./types";
import type { MatchResult } from "./matching";

const IMMOBILIEN_KLASSEN = new Set([35, 36, 37, 42, 43]);

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

const SYSTEM_PROMPT = `Du bist ein Markenrechts-Analyst. Bewerte ob eine DPMA-Markenanmeldung
eine potenzielle Verwechslungsgefahr mit der Wortmarke "MASTER" im Immobilien- und
Unternehmensberatungs-Kontext darstellt.

KONTEXT:
Der Markeninhaber "Master Immobilien GmbH" überwacht das Register nach Marken,
die mit seiner Marke "MASTER" verwechselt werden könnten — insbesondere im Bereich
Immobilien, Hausverwaltung, Makler, Bauträger, Unternehmensberatung, Consulting.

WICHTIGE REGELN:
- NUR Marken die TATSÄCHLICH im Immobilien-/Beratungs-Kontext agieren sind relevant
- "Master" in Zusammensetzungen wie "Mastercard", "Webmaster", "Masterclass",
  "Toastmaster", "Dungeon Master" → NICHT relevant (Score 0-2)
- Marken mit "Master" die in völlig anderen Branchen sind (IT, Gaming, Bildung,
  Lebensmittel, Mode, Musik) → NICHT relevant (Score 0-3)
- Nur wenn Immobilien/Bau/Hausverwaltung/Makler/Beratung erkennbar → Score 5+

SCORE-SKALA:
  9-10 = critical: Name identisch/fast identisch UND klar Immobilien/Beratungs-Bezug
  7-8  = high: Sehr ähnlicher Name UND Immobilien/Beratungs-Klassen vorhanden
  5-6  = medium: Ähnlich, Immobilien-Klassen vorhanden aber Kontext unklar
  3-4  = low: Name ähnlich, aber andere Branche erkennbar
  0-2  = irrelevant: Kein Verwechslungsrisiko (andere Branche, generischer Begriff)

Antworte NUR mit JSON:
{"score": <0-10>, "branchenbezug": "<erkannte Branche der Marke>", "prioritaet": "<low|medium|high|critical>", "begruendung": "<2-3 Sätze warum relevant oder nicht>"}`;

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
  // class_only Treffer: kein Gemini-Call
  if (match.type === "class_only") {
    return {
      score: 0,
      branchenbezug: "Unbekannt (kein Name-Match)",
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
    hit.anmelder ? `Anmelder/Inhaber: ${hit.anmelder}` : "",
    `Nizza-Klassen: ${hit.nizza_klassen.join(", ") || "keine angegeben"}`,
    `Immobilien-relevante Klasse (35/36/37/42/43) enthalten: ${hasImmoClass ? "JA" : "NEIN"}`,
    hit.waren_dienstleistungen ? `Waren/Dienstleistungen: ${hit.waren_dienstleistungen.slice(0, 500)}` : "",
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

    // Konservatives Boosting: NUR wenn Gemini selbst Immobilien-Bezug erkennt
    const geminiSaysImmo = /immobili|makler|hausverwalt|bautr|beratung|consulting/i.test(parsed.branchenbezug);

    if (match.type === "exact" && hasImmoClass && geminiSaysImmo) {
      parsed.score = Math.max(parsed.score, 9);
      parsed.prioritaet = "critical";
    } else if (match.type === "exact" && hasImmoClass) {
      parsed.score = Math.max(parsed.score, 7);
      if (parsed.prioritaet === "low") parsed.prioritaet = "medium";
    } else if (match.type === "compound" && hasImmoClass && geminiSaysImmo) {
      parsed.score = Math.max(parsed.score, 7);
      parsed.prioritaet = parsed.prioritaet === "low" ? "high" : parsed.prioritaet;
    }
    // KEIN Boosting für: compound ohne Immo-Klasse, fuzzy/phonetic

    return parsed;
  } catch (e) {
    clearTimeout(timeout);
    // Fallback: konservativer ohne Gemini
    const fallbackScore =
      match.type === "exact" ? (hasImmoClass ? 7 : 4)
      : match.type === "compound" ? (hasImmoClass ? 5 : 3)
      : match.type === "fuzzy" || match.type === "phonetic" ? (hasImmoClass ? 4 : 2)
      : 1;
    return {
      score: fallbackScore,
      branchenbezug: hasImmoClass ? "Immobilien-Klasse vorhanden" : "Nicht bewertet",
      prioritaet: fallbackScore >= 7 ? "high" : fallbackScore >= 4 ? "medium" : "low",
      begruendung: `Automatische Bewertung (Gemini nicht verfügbar): ${(e as Error).message}`,
    };
  }
}
