import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { parseDpmaDetailPage } from "./detail-parser";
import { resolveCompanyProfile } from "../resolve-company";
import { getTopVariants } from "./variant-generator";
import { launchBrowser, createStealthContext, addStealthScripts } from "./browser";
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

export async function* runDpmaSearchStream(
  stems: string[],
  opts: DpmaSearchOptions = {},
): AsyncGenerator<DpmaEvent> {
  const nurDE = opts.nurDE !== false;
  const nurInKraft = opts.nurInKraft !== false;
  const klassen = opts.klassen ?? "36 37 42";
  const zeitraumMonate = opts.zeitraumMonate ?? 3;
  const db = getSupabaseAdminClient();
  let totalFound = 0;
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  // PHASE 1: Browser-Scraping
  yield { type: "browser:start" };
  yield { type: "status", message: "Starte Chrome und öffne DPMAregister…" };

  const allHits: DpmaKurierHit[] = [];

  // Hilfsfunktion: ein Tab sucht eine Variante und gibt Basis-Hits zurück
  async function searchVariantInTab(
    ctx: Awaited<ReturnType<typeof createStealthContext>>,
    searchTerm: string,
    seenAz: Set<string>,
  ): Promise<Array<{ az: string; name: string; status: string | null }>> {
    const tabPage = await ctx.newPage();
    await addStealthScripts(tabPage);
    const hits: Array<{ az: string; name: string; status: string | null }> = [];

    try {
      await tabPage.goto("https://register.dpma.de/DPMAregister/marke/basis", { timeout: 45_000 });
      await tabPage.waitForSelector('input[name="marke"]', { timeout: 20_000 });

      await tabPage.fill('input[name="marke"]', searchTerm);
      await tabPage.fill('input[name="klassen"]', klassen);

      if (nurDE) {
        const de = tabPage.locator('input[name="demarke"]');
        if (!(await de.isChecked())) await de.check();
        const em = tabPage.locator('input[name="emmarke"]');
        if (await em.isChecked()) await em.uncheck();
        const ir = tabPage.locator('input[name="irmarke"]');
        if (await ir.isChecked()) await ir.uncheck();
      }
      if (nurInKraft) {
        try { const c = tabPage.locator('input[name="marke_inkraft_zeigen_chk"]'); if (!(await c.isChecked())) await c.check(); } catch {}
      }
      if (zeitraumMonate > 0) {
        const von = new Date();
        von.setMonth(von.getMonth() - zeitraumMonate);
        const vonStr = `${String(von.getDate()).padStart(2, "0")}.${String(von.getMonth() + 1).padStart(2, "0")}.${von.getFullYear()}`;
        try { await tabPage.fill('input[name="bwt_DateVonId"]', vonStr); } catch {}
      }
      try { await tabPage.click('input[name="radioAnsicht"][value="tabelle"]'); } catch {}

      await tabPage.click('input[name="rechercheStarten"]');
      await tabPage.waitForLoadState("networkidle", { timeout: 45_000 });
      await tabPage.waitForTimeout(3000);

      // Paginieren
      while (true) {
        const rows = await tabPage.$$("table tr");
        for (const row of rows) {
          const cells = await row.$$("td");
          if (cells.length < 4) continue;
          const cellTexts: string[] = [];
          for (const cell of cells) cellTexts.push((await cell.textContent())?.trim().replace(/\s+/g, " ") ?? "");
          const az = cellTexts[3]?.replace(/\s/g, "") ?? "";
          if (!az || !/^\d+$/.test(az) || seenAz.has(az)) continue;
          seenAz.add(az);
          hits.push({ az, name: cellTexts[4] ?? "", status: cellTexts[5] ?? null });
        }
        const next = await tabPage.$('a:has-text(">>"), a:has-text("nächste"), a[title*="nächste"]');
        if (!next) break;
        try { await next.click(); await tabPage.waitForLoadState("networkidle", { timeout: 20_000 }); await tabPage.waitForTimeout(2000); } catch { break; }
      }
    } catch {}
    await tabPage.close();
    return hits;
  }

  for (const stem of stems) {
    try {
      const variants = getTopVariants(stem, 8);
      yield { type: "status", message: `Suche nach „${stem}" + ${variants.length - 1} Varianten parallel` };

      yield { type: "status", message: "Chrome wird gestartet (kann 10-20s dauern)…" };
      const browser = await launchBrowser();
      yield { type: "status", message: "Chrome gestartet. Öffne DPMAregister…" };
      const ctx = await createStealthContext(browser);

      // PHASE 1: Alle Varianten in parallelen Batches (3 Tabs gleichzeitig) durchsuchen
      const PARALLEL = 3;
      const seenAz = new Set<string>();
      const basicHits: Array<{ az: string; name: string; status: string | null }> = [];

      for (let i = 0; i < variants.length; i += PARALLEL) {
        const batch = variants.slice(i, i + PARALLEL);
        yield { type: "status", message: `Parallel: ${batch.map(v => `„${v}"`).join(", ")}` };
        const batchResults = await Promise.all(
          batch.map((v) => searchVariantInTab(ctx, v, seenAz)),
        );
        for (const hits of batchResults) basicHits.push(...hits);
        yield { type: "status", message: `Batch fertig: ${basicHits.length} Treffer bisher` };
      }

      yield { type: "browser:loaded", trefferCount: basicHits.length };
      yield { type: "status", message: `${basicHits.length} Treffer aus ${variants.length} Varianten. Lade Details…` };

      // PHASE 2: Detail-Seiten laden (sequentiell in einem Tab)
      const detailPage = await ctx.newPage();
      await addStealthScripts(detailPage);

      for (let i = 0; i < basicHits.length; i++) {
        const bh = basicHits[i];
        try {
          await detailPage.goto(`https://register.dpma.de/DPMAregister/marke/register/${bh.az}/DE`, { timeout: 20_000 });
          await detailPage.waitForTimeout(2500);
          const rawText = await detailPage.textContent("body") ?? "";
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
      }

      await browser.close();
      yield { type: "status", message: `Chrome geschlossen. ${allHits.length} Treffer (${variants.length} Varianten).` };
    } catch (e) {
      errorCount++;
      yield { type: "error", message: `Suche „${stem}": ${(e as Error).message.slice(0, 200)}` };
    }
  }

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
