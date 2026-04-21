import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { BRAND_NAME, BRAND_OWNER, ownDomains, ownerNames } from "./brand";
import { trackGeminiCall } from "./gemini-usage";
import type { AIAnalysis, ImpressumProfile, RawSearchResult } from "./types";

const AnalysisSchema = z.object({
  score: z.number().int().min(1).max(10),
  is_violation: z.boolean(),
  violation_category: z
    .enum(["clear_violation", "suspected_violation", "borderline", "generic_use", "own_brand", "other_industry", "not_relevant"])
    .optional()
    .default("not_relevant"),
  reasoning: z.string().min(1),
  recommendation: z.string().min(1),
  subject_company: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  subject_company_address: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

function buildSystemPrompt(): string {
  const own = ownDomains();
  const ownList = own.length ? own.join(", ") : "(keine)";
  const names = ownerNames();
  const namesList = names.length ? names.map((n) => `"${n}"`).join(", ") : "(keine)";
  return `Du bist ein spezialisierter Markenrechts-Analyst. Du bewertest, ob eine Web-Fundstelle
eine potenzielle Verletzung der geschützten Wortmarke "${BRAND_NAME}" darstellt.

Die Marke ist geschützt in den Bereichen:
1. IMMOBILIEN (Makler, Hausverwaltung, Bauträger, Projektentwicklung, Vermietung, Property Management)
2. UNTERNEHMENSBERATUNG (Consulting, Management-Beratung, Business Consulting)
3. ALLE ÜBERSCHNEIDUNGSFELDER (Immobilienberatung, Investment, Facility Management, Vermögensverwaltung, Finanzberatung)

WICHTIG: Lieber EINMAL MEHR flaggen als zu wenig. Im Zweifel höheren Score vergeben.
Alles was auch nur ENTFERNT in die Bereiche Immobilien, Beratung, Consulting,
Finanzen, Investment, Facility Management, Vermögensverwaltung fällt, ist relevant.

═══ MARKENINHABER ═══
Inhaber: ${BRAND_OWNER}
Eigene Domains: ${ownList}
Eigene Firmennamen-Varianten: ${namesList}
Fundstellen, die den Markeninhaber SELBST betreffen, sind KEINE Verletzung (Score 1).

═══ WAS IST EINE VERLETZUNG? ═══
Ein Anfangsverdacht auf Markenverletzung liegt vor, wenn:
✅ Eine ANDERE Firma (nicht der Inhaber) das Wort "${BRAND_NAME}" oder eine verwechslungsfähige
   Variante PROMINENT als Teil ihres FIRMENNAMENS oder MARKENNAMENS in einem der geschützten
   Bereiche verwendet.
Beispiele für KLARE VERLETZUNGEN:
  - "Master Homes Real Estate GmbH" — Immobilienfirma mit "Master" im Namen
  - "MasterGround GmbH" — Immobilienfirma mit "Master" als Namensbestandteil
  - "AM Master Bau GmbH" — Bauträger mit "Master" im Firmennamen
  - "Master Property Management Ltd." — Hausverwaltung mit "Master" im Namen
  - "Master Consulting GmbH" — Unternehmensberatung mit "Master" im Namen
  - "Master Alliance Unternehmensberatung" — Beratungsfirma mit "Master"
  - "MasterInvest GmbH" — Investment/Finanzberatung mit "Master"
  - "Master Facility Services" — Facility Management mit "Master"

═══ WAS IST KEINE VERLETZUNG? ═══
❌ Generische Wortverwendung: "master bedroom", "Masterplan" (als Planungsbegriff), "master class"
   → Das Wort "master" wird hier als normales Adjektiv/Substantiv gebraucht, nicht als Marke.
❌ Komplett andere Branche OHNE Bezug zu Immobilien/Beratung: "Master Küchen GmbH", "Master Food"
❌ Pressemitteilungen/Artikel ÜBER den Markeninhaber selbst.
❌ Verzeichnis-/Portalseiten die den Inhaber LISTEN.
❌ Personen mit Nachnamen "Master" oder akademischem "Master"-Abschluss.
❌ Software/Apps die "master" im generischen Sinn nutzen.

═══ KATEGORIEN (violation_category) ═══
"clear_violation"      — Firma nutzt "${BRAND_NAME}" klar als Marke in Immobilien ODER Beratung
"suspected_violation"  — starker Verdacht, aber nicht 100% eindeutig
"borderline"           — grenzwertig, könnte Zufall oder generische Nutzung sein, aber lieber flaggen
"generic_use"          — Wort "master" wird generisch/beschreibend verwendet, nicht als Marke
"own_brand"            — Fundstelle betrifft den Markeninhaber selbst
"other_industry"       — Firma heißt "Master ...", aber ist in einer komplett anderen Branche (nicht Immo/Beratung)
"not_relevant"         — sonstiges, kein Bezug

═══ SCORE-ZUORDNUNG ═══
Score 9-10 → clear_violation (Anwalt einschalten)
Score 7-8  → suspected_violation (Anwalt informieren, prüfen lassen)
Score 5-6  → borderline (beobachten)
Score 3-4  → generic_use / other_industry (kein Handlungsbedarf)
Score 1-2  → own_brand / not_relevant

═══ AGGREGATOR-HINWEIS ═══
Bei Portalen (immowelt, immoscout24, kleinanzeigen, gelbeseiten, presseportale):
→ "subject_company" = die GELISTETE/GENANNTE Firma, nicht der Portalbetreiber.
→ Falls möglich, auch "subject_company_address" extrahieren (Standort der Firma).

═══ ANTWORTFORMAT ═══
Antworte AUSSCHLIESSLICH mit JSON:
{
  "score": <1-10>,
  "is_violation": <true|false>,
  "violation_category": "<category>",
  "reasoning": "<3-5 Sätze: Was ist die Fundstelle? Welche Firma nutzt MASTER? Warum Verletzung/keine Verletzung? Verwechslungsgefahr?>",
  "recommendation": "<konkrete Handlungsempfehlung für den Anwalt>",
  "subject_company": "<Firma die MASTER nutzt, oder null>",
  "subject_company_address": "<Standort/Adresse wenn erkennbar, oder null>"
}
Keine Einleitung, kein Markdown.`;
}

// Lädt vergangenes Feedback um den Gemini-Prompt zu verbessern
async function loadFeedbackContext(): Promise<string> {
  try {
    const { getSupabaseAdminClient } = await import("./supabase/server");
    const db = getSupabaseAdminClient();
    const { data } = await db
      .from("hit_feedback")
      .select("rating, correct_score, comment")
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data?.length) return "";

    const examples = data
      .filter((f) => f.comment && f.comment.length > 5)
      .slice(0, 10)
      .map((f) => {
        const label =
          f.rating === "false_positive" ? "FEHLALARM"
          : f.rating === "too_high" ? "ZU HOCH BEWERTET"
          : f.rating === "too_low" ? "ZU NIEDRIG BEWERTET"
          : f.rating === "missed" ? "ÜBERSEHEN"
          : "KORREKT";
        const scoreHint = f.correct_score !== null ? ` (korrekter Score: ${f.correct_score})` : "";
        return `- ${label}${scoreHint}: ${f.comment}`;
      })
      .join("\n");

    if (!examples) return "";
    return `\n═══ LERNHINWEISE AUS MENSCHLICHEM FEEDBACK ═══
Die folgenden Hinweise stammen von einem menschlichen Prüfer. Berücksichtige sie
bei deiner Bewertung, um die gleichen Fehler nicht zu wiederholen:
${examples}\n`;
  } catch {
    return "";
  }
}

export async function analyzeHitWithGemini(input: {
  raw: RawSearchResult;
  profile: ImpressumProfile | null;
}): Promise<AIAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const feedbackContext = await loadFeedbackContext();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: buildSystemPrompt() + feedbackContext,
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });

  const user = [
    `URL: ${input.raw.url}`,
    `Titel: ${input.raw.title}`,
    `Snippet: ${input.raw.snippet}`,
    input.profile?.company_name ? `Firma: ${input.profile.company_name}` : "",
    input.profile?.address ? `Adresse: ${input.profile.address}` : "",
    input.profile?.email ? `E-Mail: ${input.profile.email}` : "",
    input.profile?.phone ? `Telefon: ${input.profile.phone}` : "",
    input.profile?.raw ? `Impressum-Auszug:\n${input.profile.raw.slice(0, 3000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await trackGeminiCall("gemini_analyze");
  const result = await model.generateContent(user);
  const text = result.response.text();
  const parsed = AnalysisSchema.parse(JSON.parse(text));

  // Score-Boost: Gemini bewertet oft zu konservativ.
  // Wenn der Firmenname/URL klar "Master" im Immobilien-Kontext nutzt, Score anheben.
  const brandLower = BRAND_NAME.toLowerCase();
  const subjectLower = (parsed.subject_company ?? "").toLowerCase();
  const urlLower = input.raw.url.toLowerCase();
  const titleLower = input.raw.title.toLowerCase();
  const domainLower = new URL(input.raw.url).hostname.toLowerCase();

  // Exact: Firmenname enthält "master" als eigenständiges Wort
  const nameHasBrand = new RegExp(`\\b${brandLower}\\b`).test(subjectLower);
  // Domain enthält "master"
  const domainHasBrand = domainLower.includes(brandLower);
  // Immobilien-Kontext in Title/URL/Snippet
  const hasImmoContext = /immobili|makler|hausverwalt|bautr|projektentwick|vermiet|property|real.estate|unternehmensberatung|consulting|beratung|management.beratung|business.consult|facility.management|investment|vermögensverwalt|finanzberatung|anlageberatung/i.test(
    `${titleLower} ${input.raw.snippet} ${subjectLower} ${urlLower}`,
  );

  if (nameHasBrand && hasImmoContext) {
    // Klarer Treffer: Firma mit "Master" im Immobilien-Kontext
    parsed.score = Math.max(parsed.score, 8);
    if (parsed.violation_category === "not_relevant" || parsed.violation_category === "generic_use") {
      parsed.violation_category = "suspected_violation";
    }
    parsed.is_violation = true;
  } else if (nameHasBrand) {
    // Firma mit "Master" aber unklar ob Immobilien
    parsed.score = Math.max(parsed.score, 5);
  } else if (domainHasBrand && hasImmoContext) {
    // Domain mit "master" + Immobilien-Kontext
    parsed.score = Math.max(parsed.score, 7);
    parsed.is_violation = true;
  } else if (domainHasBrand) {
    // Domain mit "master" ohne klaren Immo-Kontext
    parsed.score = Math.max(parsed.score, 4);
  }

  return {
    ...parsed,
    subject_company_address: parsed.subject_company_address ?? null,
    model: modelId,
  };
}
