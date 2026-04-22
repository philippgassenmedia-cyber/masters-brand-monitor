import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { parseDpmaDetailPage } from "./detail-parser";
import { resolveCompanyProfile } from "../resolve-company";
import { getTopVariants } from "./variant-generator";
import { searchDpmaHttp } from "./register-search-http";
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

const DETAIL_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
};

async function fetchDetailPage(az: string): Promise<string> {
  const url = `https://register.dpma.de/DPMAregister/marke/register/${az}/DE`;
  const res = await fetch(url, {
    headers: DETAIL_HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  const html = await res.text();
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

export async function* runDpmaSearchStream(
  stems: string[],
  opts: DpmaSearchOptions = {},
): AsyncGenerator<DpmaEvent> {
  const nurDE = opts.nurDE !== false;
  const nurInKraft = opts.nurInKraft !== false;
  const klassen = opts.klassen ?? "36 37 42";
  const zeitraumMonate = opts.zeitraumMonate ?? 0;
  const db = getSupabaseAdminClient();
  let totalFound = 0;
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  // PHASE 1: HTTP-Scraping (kein Browser nötig)
  yield { type: "browser:start" };
  yield { type: "status", message: "Starte DPMA-Suche via HTTP…" };

  const allHits: DpmaKurierHit[] = [];

  for (const stem of stems) {
    try {
      const s = stem.charAt(0).toUpperCase() + stem.slice(1).toLowerCase();
      const phonetic = getTopVariants(stem, 3).filter((v) => v.toLowerCase() !== stem.toLowerCase()).slice(0, 3);
      const searchTerms = [s, `${s}*`, `*${s}`, ...phonetic];
      yield { type: "status", message: `Suche nach „${stem}" — ${searchTerms.length} Begriffe (exakt, Wildcards, ${phonetic.length} phonetisch)` };

      const seenAz = new Set<string>();
      const basicHits: Array<{ az: string; name: string; status: string | null }> = [];

      for (let i = 0; i < searchTerms.length; i++) {
        const v = searchTerms[i];
        yield { type: "status", message: `[${i + 1}/${searchTerms.length}] Suche: „${v}"` };
        const log: string[] = [];
        const { hits, diag } = await searchDpmaHttp(v, { nurDE, nurInKraft, klassen, zeitraumMonate }, seenAz, log);
        for (const msg of log) yield { type: "status", message: msg };
        basicHits.push(...hits);
        yield { type: "status", message: `[${i + 1}/${searchTerms.length}] „${v}": ${diag}` };
        if (i < searchTerms.length - 1) await new Promise((r) => setTimeout(r, 1000));
      }

      yield { type: "browser:loaded", trefferCount: basicHits.length };
      yield { type: "status", message: `${basicHits.length} Treffer aus ${searchTerms.length} Suchen. Lade Details…` };

      if (basicHits.length === 0) continue;

      // PHASE 2: Detail-Seiten via HTTP laden
      for (let i = 0; i < basicHits.length; i++) {
        const bh = basicHits[i];
        try {
          const rawText = await fetchDetailPage(bh.az);
          const detail = parseDpmaDetailPage(rawText);

          yield { type: "status", message: `[${i + 1}/${basicHits.length}] ${bh.name || bh.az} — ${detail.inhaber?.slice(0, 40) ?? "—"}` };

          allHits.push({
            aktenzeichen: bh.az, markenname: bh.name || `[${bh.az}]`,
            anmelder: detail.inhaber, anmeldetag: detail.anmeldetag ?? detail.eintragungstag,
            veroeffentlichungstag: detail.veroeffentlichungstag,
            status: detail.aktenzustand ?? bh.status, nizza_klassen: detail.klassen,
            waren_dienstleistungen: detail.warenDienstleistungen,
            inhaber_anschrift: detail.inhaberAnschrift, vertreter: detail.vertreter,
            markenform: detail.markenform, schutzdauer_bis: detail.schutzendedatum,
          });
        } catch {
          yield { type: "status", message: `[${i + 1}/${basicHits.length}] ${bh.az} — Detail nicht ladbar` };
          allHits.push({
            aktenzeichen: bh.az, markenname: bh.name || `[${bh.az}]`,
            anmelder: null, anmeldetag: null, veroeffentlichungstag: null,
            status: bh.status, nizza_klassen: [], waren_dienstleistungen: null,
            inhaber_anschrift: null, vertreter: null, markenform: null, schutzdauer_bis: null,
          });
        }
        if (i < basicHits.length - 1) await new Promise((r) => setTimeout(r, 500));
      }

      yield { type: "status", message: `${stem}: ${allHits.length} Treffer gesamt.` };
    } catch (e) {
      errorCount++;
      yield { type: "error", message: `Suche „${stem}": ${(e as Error).message.slice(0, 200)}` };
    }
  }

  yield { type: "status", message: "HTTP-Suche abgeschlossen." };

  // Deduplizieren
  const seen = new Set<string>();
  const uniqueHits = allHits.filter((h) => {
    if (seen.has(h.aktenzeichen)) return false;
    seen.add(h.aktenzeichen);
    return true;
  });
  totalFound = uniqueHits.length;
  yield { type: "browser:done", hitCount: uniqueHits.length };

  // PHASE 2: Analyse
  yield { type: "status", message: `Starte Analyse von ${uniqueHits.length} Treffern…` };

  for (let i = 0; i < uniqueHits.length; i++) {
    const hit = uniqueHits[i];
    yield { type: "analyze:start", index: i + 1, total: uniqueHits.length, markenname: hit.markenname };

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

      const classification = await classifyTrademark(hit, match);

      const fristEnde = hit.schutzdauer_bis ?? (hit.veroeffentlichungstag
        ? (() => { const d = new Date(hit.veroeffentlichungstag); if (isNaN(d.getTime())) return null; d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10); })()
        : null);

      // Website automatisch suchen bei relevantem Treffer
      let resolvedWebsite: string | null = null;
      const shouldLookupWebsite =
        classification.score >= 5 || match.type === "exact" || match.type === "compound";

      if (shouldLookupWebsite) {
        try {
          const searchName = hit.markenname + (hit.anmelder ? ` ${hit.anmelder}` : "");
          yield { type: "status", message: `Website suchen: ${searchName.slice(0, 50)}…` };
          const { resolvedUrl, profile: webProfile } = await resolveCompanyProfile(searchName);
          resolvedWebsite = resolvedUrl;

          // Falls Impressum-Daten gefunden, Anmelder updaten
          if (webProfile?.company_name && !hit.anmelder) {
            hit.anmelder = webProfile.company_name;
          }
        } catch {
          // Website-Suche ist optional — Fehler ignorieren
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
      newTrademarks++;
      yield { type: "hit:new", id: inserted?.id ?? "", aktenzeichen: hit.aktenzeichen, markenname: hit.markenname, score: classification.score, website: resolvedWebsite };
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
