// DPMA-Registersuche via Gemini Grounding (kein Browser nötig).
// Sucht per Google-Suche nach DPMA-Registereinträgen und extrahiert Markeninformationen.

import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { getTopVariants } from "./variant-generator";
import { trackGeminiCall } from "../gemini-usage";
import type { DpmaKurierHit } from "./types";

export type DpmaEvent =
  | { type: "status"; message: string }
  | { type: "browser:start" }
  | { type: "browser:loaded"; trefferCount: number }
  | { type: "browser:done"; hitCount: number }
  | { type: "analyze:start"; index: number; total: number; markenname: string }
  | { type: "analyze:done"; markenname: string; score: number | null; matchType: string }
  | { type: "hit:new"; id: string; aktenzeichen: string; markenname: string; score: number | null; website: string | null }
  | { type: "hit:dup"; aktenzeichen: string }
  | { type: "error"; message: string }
  | { type: "done"; totalFound: number; newTrademarks: number; updated: number; errors: number };

export interface DpmaSearchOptions {
  nurDE?: boolean;
  nurInKraft?: boolean;
  klassen?: string;
  zeitraumMonate?: number;
}

interface GeminiTrademarkHit {
  aktenzeichen: string;
  markenname: string;
  inhaber: string | null;
  status: string | null;
  nizza_klassen: number[];
  register_url: string | null;
}

/**
 * Sucht per Gemini Grounding nach DPMA-Registereinträgen.
 * Jeder Suchbegriff wird als Google-Suche mit site:register.dpma.de ausgeführt.
 */
async function searchDpmaViaGemini(
  searchTerm: string,
  klassen: string,
): Promise<GeminiTrademarkHit[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const query = `site:register.dpma.de "${searchTerm}" Marke Nizza-Klasse ${klassen}`;

  const systemPrompt = `Du durchsuchst das Deutsche Patent- und Markenamt (DPMA) Register nach Markenanmeldungen.
Extrahiere ALLE gefundenen Marken aus den Suchergebnissen.

Für jede Marke gib zurück:
- aktenzeichen: Die DPMA-Registernummer (z.B. "302024001234")
- markenname: Der Name der Marke
- inhaber: Der Inhaber/Anmelder (falls sichtbar)
- status: Status der Marke (z.B. "Eingetragen", "Angemeldet")
- nizza_klassen: Array der Nizza-Klassen als Zahlen
- register_url: URL zur DPMA-Registerseite

Antworte NUR mit einem JSON-Array. Keine Einleitung, nur JSON.
Falls keine Treffer: leeres Array [].`;

  await trackGeminiCall("gemini_dpma");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 },
      }),
    },
  );

  if (!res.ok) throw new Error(`Gemini ${res.status} ${res.statusText}`);

  const data = await res.json();

  // Grounding-Chunks auswerten — URLs mit register.dpma.de extrahieren
  const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const dpmaUrls: string[] = groundingChunks
    .filter((c: { web?: { uri: string } }) => c.web?.uri?.includes("register.dpma.de"))
    .map((c: { web: { uri: string } }) => c.web.uri);

  // Aktenzeichen aus URLs extrahieren (Format: /marke/register/XXXXXXXX/DE)
  const azFromUrls = new Set<string>();
  for (const url of dpmaUrls) {
    const m = url.match(/register\/(\d{9,15})\//);
    if (m) azFromUrls.add(m[1]);
  }

  // Gemini-Text-Antwort parsen
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("") ?? "";

  const hits: GeminiTrademarkHit[] = [];

  // Versuche JSON zu parsen
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as GeminiTrademarkHit[];
      for (const h of parsed) {
        if (h.aktenzeichen || h.markenname) {
          hits.push({
            aktenzeichen: String(h.aktenzeichen ?? "").replace(/\s/g, ""),
            markenname: h.markenname ?? "",
            inhaber: h.inhaber ?? null,
            status: h.status ?? null,
            nizza_klassen: Array.isArray(h.nizza_klassen) ? h.nizza_klassen.map(Number).filter(n => n > 0) : [],
            register_url: h.register_url ?? null,
          });
        }
      }
    } catch {
      // JSON parse failed, extract from text
    }
  }

  // Zusätzlich: Aktenzeichen aus Grounding-URLs hinzufügen die nicht in der JSON-Antwort sind
  for (const az of azFromUrls) {
    if (!hits.some(h => h.aktenzeichen === az)) {
      hits.push({
        aktenzeichen: az,
        markenname: `[${az}]`,
        inhaber: null,
        status: null,
        nizza_klassen: [],
        register_url: `https://register.dpma.de/DPMAregister/marke/register/${az}/DE`,
      });
    }
  }

  // Auch Aktenzeichen aus dem Text extrahieren (Fallback)
  const azMatches = text.matchAll(/\b(\d{9,15})\b/g);
  for (const m of azMatches) {
    const az = m[1];
    if (!hits.some(h => h.aktenzeichen === az)) {
      hits.push({
        aktenzeichen: az,
        markenname: `[${az}]`,
        inhaber: null,
        status: null,
        nizza_klassen: [],
        register_url: `https://register.dpma.de/DPMAregister/marke/register/${az}/DE`,
      });
    }
  }

  return hits;
}

export async function* runDpmaSearchStream(
  stems: string[],
  opts: DpmaSearchOptions = {},
): AsyncGenerator<DpmaEvent> {
  const klassen = opts.klassen ?? "36 37 42";
  const db = getSupabaseAdminClient();
  let totalFound = 0;
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  yield { type: "browser:start" };
  yield { type: "status", message: "Starte DPMA-Registersuche via Gemini…" };

  const allHits: DpmaKurierHit[] = [];
  const seenAz = new Set<string>();

  for (const stem of stems) {
    try {
      const variants = getTopVariants(stem, 6);
      yield { type: "status", message: `Suche nach „${stem}" + ${variants.length - 1} Varianten` };

      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        yield { type: "status", message: `[${i + 1}/${variants.length}] Suche „${variant}" im DPMA-Register…` };

        try {
          // 2s Pause zwischen Gemini-Calls
          if (i > 0) await new Promise(r => setTimeout(r, 2000));

          const results = await searchDpmaViaGemini(variant, klassen);

          for (const r of results) {
            if (!r.aktenzeichen || seenAz.has(r.aktenzeichen)) continue;
            seenAz.add(r.aktenzeichen);

            allHits.push({
              aktenzeichen: r.aktenzeichen,
              markenname: r.markenname || `[${r.aktenzeichen}]`,
              anmelder: r.inhaber,
              anmeldetag: null,
              veroeffentlichungstag: null,
              status: r.status,
              nizza_klassen: r.nizza_klassen,
              waren_dienstleistungen: null,
              inhaber_anschrift: null,
              vertreter: null,
              markenform: null,
              schutzdauer_bis: null,
            });
          }

          yield { type: "status", message: `„${variant}": ${results.length} Treffer (${allHits.length} gesamt)` };
        } catch (e) {
          errorCount++;
          yield { type: "error", message: `Suche „${variant}": ${(e as Error).message.slice(0, 150)}` };
        }
      }
    } catch (e) {
      errorCount++;
      yield { type: "error", message: `Stamm „${stem}": ${(e as Error).message.slice(0, 200)}` };
    }
  }

  totalFound = allHits.length;
  yield { type: "browser:loaded", trefferCount: totalFound };
  yield { type: "browser:done", hitCount: totalFound };

  // Phase 2: Analyse + Speicherung
  yield { type: "status", message: `Analysiere ${totalFound} Treffer…` };

  for (let i = 0; i < allHits.length; i++) {
    const hit = allHits[i];
    yield { type: "analyze:start", index: i + 1, total: allHits.length, markenname: hit.markenname };

    try {
      const match = matchAgainstStems(hit.markenname, stems);

      const { data: existing } = await db
        .from("trademarks")
        .select("id")
        .eq("aktenzeichen", hit.aktenzeichen)
        .eq("markenstamm", match.stem)
        .maybeSingle();

      if (existing) {
        await db.from("trademarks").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
        updated++;
        yield { type: "hit:dup", aktenzeichen: hit.aktenzeichen };
        continue;
      }

      // 2s Pause vor Gemini-Klassifizierung
      await new Promise(r => setTimeout(r, 2000));
      const classification = await classifyTrademark(hit, match);

      const { data: inserted } = await db.from("trademarks").insert({
        aktenzeichen: hit.aktenzeichen,
        markenname: hit.markenname,
        anmelder: hit.anmelder,
        anmeldetag: hit.anmeldetag,
        veroeffentlichungstag: hit.veroeffentlichungstag,
        status: hit.status,
        nizza_klassen: hit.nizza_klassen,
        waren_dienstleistungen: hit.waren_dienstleistungen,
        inhaber_anschrift: hit.inhaber_anschrift,
        vertreter: hit.vertreter,
        markenform: hit.markenform,
        schutzdauer_bis: hit.schutzdauer_bis,
        quelle: "dpma_register",
        match_type: match.type,
        markenstamm: match.stem,
        register_url: `https://register.dpma.de/DPMAregister/marke/register/${hit.aktenzeichen}/DE`,
        relevance_score: classification.score,
        branchenbezug: classification.branchenbezug,
        prioritaet: classification.prioritaet,
        begruendung: classification.begruendung,
      }).select("id").single();

      newTrademarks++;
      yield { type: "hit:new", id: inserted?.id ?? "", aktenzeichen: hit.aktenzeichen, markenname: hit.markenname, score: classification.score, website: null };
      yield { type: "analyze:done", markenname: hit.markenname, score: classification.score, matchType: match.type };
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        errorCount++;
        yield { type: "error", message: `${hit.aktenzeichen}: ${msg.slice(0, 150)}` };
      }
    }
  }

  yield { type: "done", totalFound, newTrademarks, updated, errors: errorCount };
}
