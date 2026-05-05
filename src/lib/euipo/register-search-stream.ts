// EUIPO-Registersuche via Gemini Grounding (kein Browser nötig).
// Sucht per Google-Suche nach EUIPO-Registereinträgen und extrahiert Markeninformationen.
// (EUIPO blockiert Datacenter-IPs via WAF — direkter API-Zugriff nicht möglich.)

import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "../dpma/matching";
import { classifyTrademark } from "../dpma/classifier";
import { resolveCompanyProfile } from "../resolve-company";
import { getTopVariants } from "../dpma/variant-generator";
import { trackGeminiCall } from "../gemini-usage";
import type { DpmaKurierHit } from "../dpma/types";

export type EuipoEvent =
  | { type: "status"; message: string }
  | { type: "browser:start" }
  | { type: "browser:loaded"; trefferCount: number }
  | { type: "browser:done"; hitCount: number }
  | { type: "analyze:start"; index: number; total: number; markenname: string }
  | { type: "analyze:done"; markenname: string; score: number | null; matchType: string }
  | { type: "hit:new"; id: string; aktenzeichen: string; markenname: string; score: number | null; website?: string | null }
  | { type: "hit:dup"; aktenzeichen: string }
  | { type: "error"; message: string }
  | { type: "done"; totalFound: number; newTrademarks: number; updated: number; errors: number };

export interface EuipoSearchOptions {
  klassen?: string;
  zeitraumMonate?: number;
  nurInKraft?: boolean;
}

export interface EuipoRawHit {
  applicationNumber: string;
  trademarkName: string;
  trademarkStatus: string | null;
  applicantName: string | null;
  applicantAddress: string | null;
  niceClasses: number[];
  applicationDate: string | null;
  publicationDate: string | null;
  expiryDate: string | null;
  goodsAndServices: string | null;
  representative: string | null;
  trademarkType: string | null;
}

interface GeminiEuipoHit {
  aktenzeichen: string;
  markenname: string;
  inhaber: string | null;
  status: string | null;
  nizza_klassen: number[];
  register_url: string | null;
}

// ── Gemini Grounding Search ───────────────────────────────────────────────────

async function searchEuipoViaGemini(
  searchTerm: string,
  klassen: string,
): Promise<GeminiEuipoHit[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const query = `site:euipo.europa.eu "${searchTerm}" trademark EUTM Nizza ${klassen}`;

  const systemPrompt = `Du durchsuchst das EUIPO (European Union Intellectual Property Office) Register nach EU-Markenanmeldungen (EUTM).
Extrahiere ALLE gefundenen Marken aus den Suchergebnissen.

Für jede Marke gib zurück:
- aktenzeichen: Die EUIPO-Registernummer (z.B. "018123456789" oder "1234567")
- markenname: Der Name der Marke
- inhaber: Der Inhaber/Anmelder (falls sichtbar)
- status: Status der Marke (z.B. "Registered", "Filed", "Published")
- nizza_klassen: Array der Nizza-Klassen als Zahlen
- register_url: URL zur EUIPO-Detailseite (Format: https://euipo.europa.eu/eSearch/#details/trademarks/NUMMER)

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
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) throw new Error(`Gemini ${res.status} ${res.statusText}`);

  const data = await res.json();

  // Grounding-Chunks: URLs mit euipo.europa.eu extrahieren
  const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const euipoUrls: string[] = groundingChunks
    .filter((c: { web?: { uri: string } }) => c.web?.uri?.includes("euipo.europa.eu"))
    .map((c: { web: { uri: string } }) => c.web.uri);

  // Aktenzeichen aus EUIPO-URLs extrahieren (Format: /trademarks/XXXXXXXXX)
  const azFromUrls = new Set<string>();
  for (const url of euipoUrls) {
    const m = url.match(/\/trademarks\/(\d{7,15})/);
    if (m) azFromUrls.add(m[1]);
  }

  // Gemini-Text-Antwort parsen
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("") ?? "";

  const hits: GeminiEuipoHit[] = [];

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as GeminiEuipoHit[];
      for (const h of parsed) {
        if (h.aktenzeichen || h.markenname) {
          hits.push({
            aktenzeichen: String(h.aktenzeichen ?? "").replace(/\s/g, ""),
            markenname: h.markenname ?? "",
            inhaber: h.inhaber ?? null,
            status: h.status ?? null,
            nizza_klassen: Array.isArray(h.nizza_klassen) ? h.nizza_klassen.map(Number).filter((n) => n > 0) : [],
            register_url: h.register_url ?? null,
          });
        }
      }
    } catch {}
  }

  // Aktenzeichen aus Grounding-URLs ergänzen
  for (const az of azFromUrls) {
    if (!hits.some((h) => h.aktenzeichen === az)) {
      hits.push({
        aktenzeichen: az,
        markenname: `[EUTM ${az}]`,
        inhaber: null,
        status: null,
        nizza_klassen: [],
        register_url: `https://euipo.europa.eu/eSearch/#details/trademarks/${az}`,
      });
    }
  }

  // Fallback: Aktenzeichen aus Text (7–15 Ziffern)
  for (const m of text.matchAll(/\b(\d{7,15})\b/g)) {
    const az = m[1];
    if (!hits.some((h) => h.aktenzeichen === az)) {
      hits.push({
        aktenzeichen: az,
        markenname: `[EUTM ${az}]`,
        inhaber: null,
        status: null,
        nizza_klassen: [],
        register_url: `https://euipo.europa.eu/eSearch/#details/trademarks/${az}`,
      });
    }
  }

  return hits;
}

// ── Classify & Save ───────────────────────────────────────────────────────────

async function* classifyAndSave(
  hits: GeminiEuipoHit[],
  stems: string[],
): AsyncGenerator<EuipoEvent> {
  const db = getSupabaseAdminClient();

  for (let i = 0; i < hits.length; i++) {
    const raw = hits[i];
    const hit: DpmaKurierHit = {
      aktenzeichen: raw.aktenzeichen,
      markenname: raw.markenname,
      anmelder: raw.inhaber,
      anmeldetag: null,
      veroeffentlichungstag: null,
      status: raw.status,
      nizza_klassen: raw.nizza_klassen,
      waren_dienstleistungen: null,
      inhaber_anschrift: null,
      vertreter: null,
      markenform: null,
      schutzdauer_bis: null,
    };

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

      await new Promise((r) => setTimeout(r, 1500));
      const classification = await classifyTrademark(hit, match);

      let resolvedWebsite: string | null = null;
      if (classification.score >= 5 || match.type === "exact" || match.type === "compound") {
        try {
          const searchName = hit.markenname + (hit.anmelder ? ` ${hit.anmelder}` : "");
          yield { type: "status", message: `Website suchen: ${searchName.slice(0, 50)}…` };
          const { resolvedUrl, profile: webProfile } = await resolveCompanyProfile(searchName);
          resolvedWebsite = resolvedUrl;
          if (webProfile?.company_name && !hit.anmelder) {
            hit.anmelder = webProfile.company_name as string;
          }
        } catch {}
      }

      const registerUrl = raw.register_url
        ?? `https://euipo.europa.eu/eSearch/#details/trademarks/${raw.aktenzeichen}`;

      const { data: inserted } = await db
        .from("trademarks")
        .insert({
          aktenzeichen: hit.aktenzeichen,
          markenname: hit.markenname,
          anmelder: hit.anmelder,
          anmeldetag: hit.anmeldetag,
          status: hit.status,
          nizza_klassen: hit.nizza_klassen,
          quelle: "euipo",
          match_type: match.type,
          markenstamm: match.stem,
          register_url: registerUrl,
          relevance_score: classification.score,
          branchenbezug: classification.branchenbezug,
          prioritaet: classification.prioritaet,
          begruendung: classification.begruendung,
          resolved_website: resolvedWebsite,
        })
        .select("id")
        .single();

      yield {
        type: "hit:new",
        id: inserted?.id ?? "",
        aktenzeichen: hit.aktenzeichen,
        markenname: hit.markenname,
        score: classification.score,
        website: resolvedWebsite,
      };
      yield { type: "analyze:done", markenname: hit.markenname, score: classification.score, matchType: match.type };
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        yield { type: "error", message: `${raw.aktenzeichen}: ${msg.slice(0, 150)}` };
      }
    }
  }
}

// ── Public exports ────────────────────────────────────────────────────────────

/** Für /api/euipo/classify — klassifiziert bereits gesammelte Hits (EuipoRawHit). */
export async function* runEuipoClassify(
  rawHits: EuipoRawHit[],
  stems: string[],
): AsyncGenerator<EuipoEvent> {
  // EuipoRawHit → GeminiEuipoHit mapping
  const hits: GeminiEuipoHit[] = rawHits.map((h) => ({
    aktenzeichen: h.applicationNumber,
    markenname: h.trademarkName,
    inhaber: h.applicantName,
    status: h.trademarkStatus,
    nizza_klassen: h.niceClasses,
    register_url: `https://euipo.europa.eu/eSearch/#details/trademarks/${h.applicationNumber}`,
  }));

  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  yield { type: "browser:done", hitCount: hits.length };
  yield { type: "status", message: `Starte Analyse von ${hits.length} EUIPO-Treffern…` };

  for await (const ev of classifyAndSave(hits, stems)) {
    if (ev.type === "hit:new") newTrademarks++;
    else if (ev.type === "hit:dup") updated++;
    else if (ev.type === "error") errorCount++;
    yield ev;
  }

  yield { type: "done", totalFound: hits.length, newTrademarks, updated, errors: errorCount };
}

/** Vollständiger EUIPO-Scan via Gemini Grounding — pro Cluster suchen, sofort speichern. */
export async function* runEuipoSearchStream(
  stems: string[],
  opts: EuipoSearchOptions = {},
): AsyncGenerator<EuipoEvent> {
  const klassen = opts.klassen ?? "36 37 42";
  let totalFound = 0;
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;
  const seenAz = new Set<string>();

  yield { type: "status", message: "Starte EUIPO-Suche via Gemini Grounding…" };

  for (const stem of stems) {
    const variants = getTopVariants(stem, 6);
    yield { type: "status", message: `Cluster „${stem}": ${variants.length} Varianten → EUIPO via Google…` };

    const stemHits: GeminiEuipoHit[] = [];

    for (const variant of variants) {
      yield { type: "status", message: `EUIPO: suche „${variant}"…` };
      try {
        const hits = await searchEuipoViaGemini(variant, klassen);
        const newHits = hits.filter((h) => h.aktenzeichen && !seenAz.has(h.aktenzeichen));
        newHits.forEach((h) => seenAz.add(h.aktenzeichen));
        stemHits.push(...newHits);
        yield { type: "status", message: `„${variant}": ${newHits.length} Treffer (Cluster gesamt: ${stemHits.length})` };
      } catch (e) {
        yield { type: "error", message: `Suche „${variant}": ${(e as Error).message.slice(0, 150)}` };
      }
    }

    totalFound += stemHits.length;
    yield { type: "browser:loaded", trefferCount: stemHits.length };

    if (stemHits.length === 0) {
      yield { type: "status", message: `Cluster „${stem}": keine Treffer gefunden` };
      continue;
    }

    yield { type: "status", message: `Cluster „${stem}": ${stemHits.length} Treffer → Analyse & Speicherung…` };

    for await (const ev of classifyAndSave(stemHits, stems)) {
      if (ev.type === "hit:new") newTrademarks++;
      else if (ev.type === "hit:dup") updated++;
      else if (ev.type === "error") errorCount++;
      yield ev;
    }

    yield { type: "status", message: `✓ Cluster „${stem}" gespeichert — ${stemHits.length} verarbeitet` };
  }

  yield { type: "browser:done", hitCount: totalFound };
  yield { type: "done", totalFound, newTrademarks, updated, errors: errorCount };
}
