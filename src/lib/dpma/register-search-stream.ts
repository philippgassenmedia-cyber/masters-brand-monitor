// DPMA-Registersuche via Gemini Grounding (kein Browser nötig).
// Sucht per Google-Suche nach DPMA-Registereinträgen und extrahiert Markeninformationen.

import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { resolveCompanyProfile } from "../resolve-company";
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
  let totalErrors = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  let totalFound = 0;
  const seenAz = new Set<string>();

  yield { type: "browser:start" };
  yield { type: "status", message: "Starte DPMA-Registersuche via Gemini…" };

  for (const stem of stems) {
    const stemHits: DpmaKurierHit[] = [];

    try {
      const variants = getTopVariants(stem, 6);
      yield { type: "status", message: `Cluster „${stem}": ${variants.length} Suchvarianten` };

      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        yield { type: "status", message: `[${i + 1}/${variants.length}] Suche „${variant}" im DPMA-Register…` };

        try {
          if (i > 0) await new Promise(r => setTimeout(r, 2000));

          const results = await searchDpmaViaGemini(variant, klassen);

          for (const r of results) {
            if (!r.aktenzeichen || seenAz.has(r.aktenzeichen)) continue;
            seenAz.add(r.aktenzeichen);

            stemHits.push({
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

          yield { type: "status", message: `„${variant}": ${results.length} Treffer (${stemHits.length} für „${stem}")` };
        } catch (e) {
          totalErrors++;
          yield { type: "error", message: `Suche „${variant}": ${(e as Error).message.slice(0, 150)}` };
        }
      }
    } catch (e) {
      totalErrors++;
      yield { type: "error", message: `Stamm „${stem}": ${(e as Error).message.slice(0, 200)}` };
    }

    // Sofort nach jedem Cluster: Treffer analysieren und in DB speichern
    if (stemHits.length > 0) {
      yield { type: "status", message: `Cluster „${stem}": ${stemHits.length} Treffer → Analyse & Speicherung…` };
      yield { type: "browser:loaded", trefferCount: stemHits.length };

      for await (const ev of classifyAndSave(stemHits, stems)) {
        if (ev.type === "hit:new") totalNew++;
        else if (ev.type === "hit:dup") totalUpdated++;
        else if (ev.type === "error") totalErrors++;
        yield ev;
      }

      yield { type: "status", message: `✓ Cluster „${stem}" gespeichert — ${stemHits.length} verarbeitet` };
    } else {
      yield { type: "status", message: `Cluster „${stem}": keine neuen Treffer` };
    }

    totalFound += stemHits.length;
  }

  yield { type: "done", totalFound, newTrademarks: totalNew, updated: totalUpdated, errors: totalErrors };
}

/** Öffentlicher Export für /api/dpma/classify — klassifiziert alle Treffer und emittiert done. */
export async function* runDpmaClassify(
  uniqueHits: DpmaKurierHit[],
  stems: string[],
): AsyncGenerator<DpmaEvent> {
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  yield { type: "browser:done", hitCount: uniqueHits.length };
  yield { type: "status", message: `Starte Analyse von ${uniqueHits.length} Treffern…` };

  for await (const ev of classifyAndSave(uniqueHits, stems)) {
    if (ev.type === "hit:new") newTrademarks++;
    else if (ev.type === "hit:dup") updated++;
    else if (ev.type === "error") errorCount++;
    yield ev;
  }

  yield { type: "done", totalFound: uniqueHits.length, newTrademarks, updated, errors: errorCount };
}

/** Klassifiziert Treffer und speichert sie in der DB (kein done-Event, für interne Nutzung). */
async function* classifyAndSave(
  hits: DpmaKurierHit[],
  stems: string[],
): AsyncGenerator<DpmaEvent> {
  const db = getSupabaseAdminClient();

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    yield { type: "analyze:start", index: i + 1, total: hits.length, markenname: hit.markenname };

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
        yield { type: "hit:dup", aktenzeichen: hit.aktenzeichen };
        continue;
      }

      await new Promise(r => setTimeout(r, 2000));
      const classification = await classifyTrademark(hit, match);

      const fristEnde = hit.schutzdauer_bis ?? (hit.veroeffentlichungstag
        ? (() => { const d = new Date(hit.veroeffentlichungstag!); if (isNaN(d.getTime())) return null; d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10); })()
        : null);

      let resolvedWebsite: string | null = null;
      const shouldLookupWebsite =
        classification.score >= 5 || match.type === "exact" || match.type === "compound";

      if (shouldLookupWebsite) {
        try {
          const searchName = hit.markenname + (hit.anmelder ? ` ${hit.anmelder}` : "");
          yield { type: "status", message: `Website suchen: ${searchName.slice(0, 50)}…` };
          const { resolvedUrl, profile: webProfile } = await resolveCompanyProfile(searchName);
          resolvedWebsite = resolvedUrl;
          if (webProfile?.company_name && !hit.anmelder) {
            hit.anmelder = webProfile.company_name;
          }
        } catch {
          // Website-Suche ist optional
        }
      }

      const { data: inserted } = await db.from("trademarks").insert({
        aktenzeichen: hit.aktenzeichen,
        markenname: hit.markenname,
        anmelder: hit.anmelder,
        anmeldetag: hit.anmeldetag,
        veroeffentlichungstag: hit.veroeffentlichungstag,
        widerspruchsfrist_ende: fristEnde,
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
        resolved_website: resolvedWebsite,
      }).select("id").single();

      yield { type: "hit:new", id: inserted?.id ?? "", aktenzeichen: hit.aktenzeichen, markenname: hit.markenname, score: classification.score, website: resolvedWebsite };
      yield { type: "analyze:done", markenname: hit.markenname, score: classification.score, matchType: match.type };
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        yield { type: "error", message: `${hit.aktenzeichen}: ${msg.slice(0, 150)}` };
      }
    }
  }
}
