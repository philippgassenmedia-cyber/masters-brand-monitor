import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "../dpma/matching";
import { classifyTrademark } from "../dpma/classifier";
import { getTopVariants } from "../dpma/variant-generator";
import { trackGeminiCall } from "../gemini-usage";
import { launchBrowser, createStealthContext, addStealthScripts } from "../dpma/browser";
import type { DpmaKurierHit } from "../dpma/types";

export type EuipoEvent =
  | { type: "status"; message: string }
  | { type: "browser:start" }
  | { type: "browser:loaded"; trefferCount: number }
  | { type: "browser:done"; hitCount: number }
  | { type: "analyze:start"; index: number; total: number; markenname: string }
  | { type: "analyze:done"; markenname: string; score: number | null; matchType: string }
  | { type: "hit:new"; id: string; aktenzeichen: string; markenname: string; score: number | null }
  | { type: "hit:dup"; aktenzeichen: string }
  | { type: "error"; message: string }
  | { type: "done"; totalFound: number; newTrademarks: number; updated: number; errors: number };

export interface EuipoSearchOptions {
  klassen?: string;
  zeitraumMonate?: number;
}

async function searchEuipoInTab(
  ctx: Awaited<ReturnType<typeof createStealthContext>>,
  searchTerm: string,
  klassen: string,
  seenAz: Set<string>,
): Promise<Array<{ az: string; name: string; applicant: string | null; status: string | null; classes: number[] }>> {
  const page = await ctx.newPage();
  await addStealthScripts(page);
  const hits: Array<{ az: string; name: string; applicant: string | null; status: string | null; classes: number[] }> = [];

  try {
    // EUIPO eSearch plus
    const params = new URLSearchParams({
      page: "1",
      size: "50",
      keyword: searchTerm,
      "searchbar": "Search",
    });
    await page.goto(`https://euipo.europa.eu/eSearch/#basic/${encodeURIComponent(searchTerm)}`, {
      timeout: 45_000,
    });
    await page.waitForTimeout(5000);

    // Warte auf Ergebnisse oder "No results"
    await page.waitForSelector(".result-list, .no-results, .search-results", { timeout: 20_000 }).catch(() => {});

    const bodyText = await page.textContent("body") ?? "";

    // Ergebnis-Zeilen parsen
    const rows = await page.$$(".result-list tr, .search-result-item, [class*='result'] tr");

    for (const row of rows) {
      const text = (await row.textContent() ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 10) continue;

      // EUIPO-Nummern: Format "018XXXXXX" oder "EUTM XXXXXXX"
      const azMatch = text.match(/(\d{9,12})/);
      if (!azMatch) continue;
      const az = azMatch[1];
      if (seenAz.has(az)) continue;
      seenAz.add(az);

      // Name extrahieren
      const cells = await row.$$("td, .cell, [class*='col']");
      const cellTexts: string[] = [];
      for (const c of cells) cellTexts.push((await c.textContent())?.trim() ?? "");

      let name = "";
      let applicant: string | null = null;
      let status: string | null = null;
      const classes: number[] = [];

      for (const ct of cellTexts) {
        if (ct.length >= 2 && ct.length < 150 && !/^\d+$/.test(ct) && !ct.includes(az)) {
          if (!name) name = ct;
          else if (!applicant && ct.length > 3) applicant = ct;
        }
        // Klassen
        const klMatch = ct.match(/^(\d{1,2}(?:,\s*\d{1,2})*)$/);
        if (klMatch) {
          klMatch[1].split(/,\s*/).map(Number).filter(n => n > 0 && n <= 45).forEach(n => classes.push(n));
        }
        // Status
        if (/registered|filed|published|refused|withdrawn|expired/i.test(ct)) {
          status = ct.trim();
        }
      }

      if (name || az) {
        hits.push({ az, name: name || `[EUTM ${az}]`, applicant, status, classes });
      }
    }
  } catch {}
  await page.close();
  return hits;
}

export async function* runEuipoSearchStream(
  stems: string[],
  opts: EuipoSearchOptions = {},
): AsyncGenerator<EuipoEvent> {
  const klassen = opts.klassen ?? "36 37 42";
  const db = getSupabaseAdminClient();
  let totalFound = 0;
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  yield { type: "browser:start" };

  for (const stem of stems) {
    try {
      const variants = getTopVariants(stem, 6);
      yield { type: "status", message: `EUIPO: Suche nach „${stem}" + ${variants.length - 1} Varianten` };

      const browser = await launchBrowser();
      const ctx = await createStealthContext(browser);

      const PARALLEL = 3;
      const seenAz = new Set<string>();
      const allBasicHits: Array<{ az: string; name: string; applicant: string | null; status: string | null; classes: number[] }> = [];

      for (let i = 0; i < variants.length; i += PARALLEL) {
        const batch = variants.slice(i, i + PARALLEL);
        yield { type: "status", message: `EUIPO parallel: ${batch.map(v => `„${v}"`).join(", ")}` };
        const results = await Promise.all(
          batch.map((v) => searchEuipoInTab(ctx, v, klassen, seenAz)),
        );
        for (const r of results) allBasicHits.push(...r);
        yield { type: "status", message: `EUIPO: ${allBasicHits.length} Treffer bisher` };
      }

      totalFound += allBasicHits.length;
      yield { type: "browser:loaded", trefferCount: allBasicHits.length };
      yield { type: "browser:done", hitCount: allBasicHits.length };

      await browser.close();
      yield { type: "status", message: `EUIPO Browser geschlossen. ${allBasicHits.length} Treffer.` };

      // Analyse
      for (let i = 0; i < allBasicHits.length; i++) {
        const bh = allBasicHits[i];
        yield { type: "analyze:start", index: i + 1, total: allBasicHits.length, markenname: bh.name };

        try {
          const hit: DpmaKurierHit = {
            aktenzeichen: bh.az,
            markenname: bh.name,
            anmelder: bh.applicant,
            anmeldetag: null,
            veroeffentlichungstag: null,
            status: bh.status,
            nizza_klassen: bh.classes,
            waren_dienstleistungen: null,
            inhaber_anschrift: null,
            vertreter: null,
            markenform: null,
            schutzdauer_bis: null,
          };

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

          const { data: inserted } = await db.from("trademarks").insert({
            aktenzeichen: hit.aktenzeichen,
            markenname: hit.markenname,
            anmelder: hit.anmelder,
            anmeldetag: hit.anmeldetag,
            status: hit.status,
            nizza_klassen: hit.nizza_klassen,
            quelle: "euipo",
            match_type: match.type,
            markenstamm: match.stem,
            register_url: `https://euipo.europa.eu/eSearch/#details/trademarks/${hit.aktenzeichen}`,
            relevance_score: classification.score,
            branchenbezug: classification.branchenbezug,
            prioritaet: classification.prioritaet,
            begruendung: classification.begruendung,
          }).select("id").single();

          newTrademarks++;
          yield { type: "hit:new", id: inserted?.id ?? "", aktenzeichen: hit.aktenzeichen, markenname: hit.markenname, score: classification.score };
          yield { type: "analyze:done", markenname: hit.markenname, score: classification.score, matchType: match.type };
        } catch (e) {
          const msg = (e as Error).message;
          if (!msg.includes("duplicate") && !msg.includes("unique")) {
            errorCount++;
            yield { type: "error", message: `${bh.az}: ${msg.slice(0, 150)}` };
          }
        }
      }
    } catch (e) {
      errorCount++;
      yield { type: "error", message: `EUIPO „${stem}": ${(e as Error).message.slice(0, 200)}` };
    }
  }

  yield { type: "done", totalFound, newTrademarks, updated, errors: errorCount };
}
