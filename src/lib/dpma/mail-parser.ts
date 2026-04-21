// Parst DPMAkurier-Emails mit Gemini (JSON response mode).
// Extrahiert strukturierte Markendaten aus dem E-Mail-Body.

import { trackGeminiCall } from "../gemini-usage";
import type { DpmaKurierHit } from "./types";

const SYSTEM_PROMPT = `Du bist ein Markenrecht-Parser. Du erhältst den Text einer DPMAkurier-Benachrichtigungs-Email
und extrahierst ALLE genannten Markenanmeldungen als strukturiertes JSON.

Für JEDE Marke extrahiere:
- aktenzeichen: Aktenzeichen / Registernummer (z.B. "3020240123456")
- markenname: Der angemeldete Markenname
- anmelder: Name des Anmelders/Inhabers (falls genannt)
- anmeldetag: Anmeldetag im Format "YYYY-MM-DD" (falls genannt)
- veroeffentlichungstag: Veröffentlichungstag im Format "YYYY-MM-DD" (falls genannt)
- status: Status der Marke (z.B. "Anmeldung veröffentlicht", "Eingetragen")
- nizza_klassen: Array von Nizza-Klassen als Zahlen (z.B. [35, 36, 42])
- waren_dienstleistungen: Waren/Dienstleistungen Text (falls vorhanden)
- inhaber_anschrift: Anschrift des Inhabers (falls vorhanden)
- vertreter: Vertreter/Anwalt (falls genannt)
- markenform: Markenform (z.B. "Wortmarke", "Wort-/Bildmarke")
- schutzdauer_bis: Ende der Schutzdauer im Format "YYYY-MM-DD" (falls genannt)

Antworte NUR mit JSON:
{"hits": [...], "errors": []}
Falls ein Feld nicht gefunden wird, setze es auf null.
Falls keine Treffer gefunden werden: {"hits": [], "errors": ["Keine Marken im E-Mail-Text gefunden"]}`;

export async function parseDpmaEmail(
  body: string,
): Promise<{ hits: DpmaKurierHit[]; errors: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  // E-Mail-Body kürzen falls zu lang
  const truncated = body.slice(0, 30_000);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);

  try {
    await trackGeminiCall("gemini_parse");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: truncated }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    if (!text) {
      return { hits: [], errors: ["Leere Gemini-Antwort"] };
    }

    const parsed = JSON.parse(text) as {
      hits: Array<{
        aktenzeichen?: string;
        markenname?: string;
        anmelder?: string | null;
        anmeldetag?: string | null;
        veroeffentlichungstag?: string | null;
        status?: string | null;
        nizza_klassen?: number[] | null;
        waren_dienstleistungen?: string | null;
        inhaber_anschrift?: string | null;
        vertreter?: string | null;
        markenform?: string | null;
        schutzdauer_bis?: string | null;
      }>;
      errors?: string[];
    };

    const hits: DpmaKurierHit[] = (parsed.hits ?? [])
      .filter((h) => h.aktenzeichen && h.markenname)
      .map((h) => ({
        aktenzeichen: h.aktenzeichen!.replace(/\s/g, ""),
        markenname: h.markenname!,
        anmelder: h.anmelder ?? null,
        anmeldetag: h.anmeldetag ?? null,
        veroeffentlichungstag: h.veroeffentlichungstag ?? null,
        status: h.status ?? null,
        nizza_klassen: Array.isArray(h.nizza_klassen) ? h.nizza_klassen : [],
        waren_dienstleistungen: h.waren_dienstleistungen ?? null,
        inhaber_anschrift: h.inhaber_anschrift ?? null,
        vertreter: h.vertreter ?? null,
        markenform: h.markenform ?? null,
        schutzdauer_bis: h.schutzdauer_bis ?? null,
      }));

    return {
      hits,
      errors: parsed.errors ?? [],
    };
  } catch (e) {
    clearTimeout(timeout);
    return {
      hits: [],
      errors: [`Gemini-Parse-Fehler: ${(e as Error).message}`],
    };
  }
}
