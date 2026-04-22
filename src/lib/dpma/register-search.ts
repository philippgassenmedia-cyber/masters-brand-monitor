// Nicht-streamende DPMA-Registersuche via Gemini Grounding (Fallback).
// Wird vom scheduled-runner und vom cron genutzt.

import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { trackGeminiCall } from "../gemini-usage";
import type { DpmaKurierHit } from "./types";

export interface DpmaSearchResult {
  totalFound: number;
  newTrademarks: number;
  updated: number;
  errors: string[];
}

async function searchDpmaViaGemini(
  searchTerm: string,
  klassen: string,
): Promise<Array<{ aktenzeichen: string; markenname: string; inhaber: string | null; status: string | null; nizza_klassen: number[] }>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const query = `site:register.dpma.de "${searchTerm}" Marke Nizza-Klasse ${klassen}`;

  const systemPrompt = `Du durchsuchst das DPMA-Register nach Markenanmeldungen.
Extrahiere ALLE gefundenen Marken. Für jede: aktenzeichen, markenname, inhaber, status, nizza_klassen (als Zahlen-Array).
Antworte NUR mit JSON-Array. Falls keine Treffer: [].`;

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

  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();

  // Grounding URLs
  const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const azFromUrls = new Set<string>();
  for (const c of groundingChunks) {
    const url = c.web?.uri ?? "";
    const m = url.match(/register\/(\d{9,15})\//);
    if (m) azFromUrls.add(m[1]);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

  const hits: Array<{ aktenzeichen: string; markenname: string; inhaber: string | null; status: string | null; nizza_klassen: number[] }> = [];

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const h of parsed) {
        if (h.aktenzeichen || h.markenname) {
          hits.push({
            aktenzeichen: String(h.aktenzeichen ?? "").replace(/\s/g, ""),
            markenname: h.markenname ?? "",
            inhaber: h.inhaber ?? null,
            status: h.status ?? null,
            nizza_klassen: Array.isArray(h.nizza_klassen) ? h.nizza_klassen.map(Number).filter((n: number) => n > 0) : [],
          });
        }
      }
    } catch {}
  }

  for (const az of azFromUrls) {
    if (!hits.some(h => h.aktenzeichen === az)) {
      hits.push({ aktenzeichen: az, markenname: `[${az}]`, inhaber: null, status: null, nizza_klassen: [] });
    }
  }

  return hits;
}

export async function searchDpmaRegister(
  stems: string[],
  nizzaKlassen = "36 37 42",
): Promise<DpmaSearchResult> {
  const db = getSupabaseAdminClient();
  const result: DpmaSearchResult = { totalFound: 0, newTrademarks: 0, updated: 0, errors: [] };
  const seenAz = new Set<string>();
  const allHits: DpmaKurierHit[] = [];

  for (const stem of stems) {
    const variants = [stem, ...stems.filter(s => s !== stem)].slice(0, 4);
    for (const variant of variants) {
      try {
        if (seenAz.size > 0) await new Promise(r => setTimeout(r, 2000));
        const hits = await searchDpmaViaGemini(variant, nizzaKlassen);
        for (const h of hits) {
          if (!h.aktenzeichen || seenAz.has(h.aktenzeichen)) continue;
          seenAz.add(h.aktenzeichen);
          allHits.push({
            aktenzeichen: h.aktenzeichen,
            markenname: h.markenname,
            anmelder: h.inhaber,
            anmeldetag: null, veroeffentlichungstag: null,
            status: h.status,
            nizza_klassen: h.nizza_klassen,
            waren_dienstleistungen: null, inhaber_anschrift: null,
            vertreter: null, markenform: null, schutzdauer_bis: null,
          });
        }
      } catch (e) {
        result.errors.push(`${variant}: ${(e as Error).message.slice(0, 150)}`);
      }
    }
  }

  result.totalFound = allHits.length;

  for (const hit of allHits) {
    try {
      const match = matchAgainstStems(hit.markenname, stems);
      const { data: existing } = await db
        .from("trademarks").select("id")
        .eq("aktenzeichen", hit.aktenzeichen).eq("markenstamm", match.stem)
        .maybeSingle();

      if (existing) {
        await db.from("trademarks").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
        result.updated++;
        continue;
      }

      await new Promise(r => setTimeout(r, 2000));
      const classification = await classifyTrademark(hit, match);

      await db.from("trademarks").insert({
        aktenzeichen: hit.aktenzeichen,
        markenname: hit.markenname,
        anmelder: hit.anmelder,
        status: hit.status,
        nizza_klassen: hit.nizza_klassen,
        quelle: "dpma_register",
        match_type: match.type,
        markenstamm: match.stem,
        register_url: `https://register.dpma.de/DPMAregister/marke/register/${hit.aktenzeichen}/DE`,
        relevance_score: classification.score,
        branchenbezug: classification.branchenbezug,
        prioritaet: classification.prioritaet,
        begruendung: classification.begruendung,
      });
      result.newTrademarks++;
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        result.errors.push(`${hit.aktenzeichen}: ${msg.slice(0, 150)}`);
      }
    }
  }

  return result;
}
