import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { parseDpmaDetailPage } from "./detail-parser";
import { resolveCompanyProfile } from "../resolve-company";
import { getTopVariants } from "./variant-generator";
import { launchBrowser, createStealthContext, addStealthScripts } from "./browser";
import type { DpmaKurierHit } from "./types";
import type { Page } from "playwright-core";

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
  const zeitraumMonate = opts.zeitraumMonate ?? 0;
  const db = getSupabaseAdminClient();
  let totalFound = 0;
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  // PHASE 1: Browser-Scraping
  yield { type: "browser:start" };
  yield { type: "status", message: "Starte Chrome und öffne DPMAregister…" };

  const allHits: DpmaKurierHit[] = [];

  // Sucht einen Begriff auf einer bereits geöffneten Seite — kein Tab-Open/Close pro Suche
  async function searchOnPage(
    page: Page,
    searchTerm: string,
    seenAz: Set<string>,
  ): Promise<{ hits: Array<{ az: string; name: string; status: string | null }>; diag: string }> {
    const hits: Array<{ az: string; name: string; status: string | null }> = [];
    let diag = "";
    try {
      await page.goto("https://register.dpma.de/DPMAregister/marke/basis", {
        timeout: 40_000, waitUntil: "domcontentloaded",
      });
      await page.waitForSelector('input[name="marke"]', { timeout: 15_000 });

      await page.fill('input[name="marke"]', "");
      await page.fill('input[name="marke"]', searchTerm);
      await page.fill('input[name="klassen"]', "");
      await page.fill('input[name="klassen"]', klassen);

      if (nurDE) {
        const de = page.locator('input[name="demarke"]');
        if (!(await de.isChecked())) await de.check();
        const em = page.locator('input[name="emmarke"]');
        if (await em.isChecked()) await em.uncheck();
        const ir = page.locator('input[name="irmarke"]');
        if (await ir.isChecked()) await ir.uncheck();
      }
      if (nurInKraft) {
        try { const c = page.locator('input[name="marke_inkraft_zeigen_chk"]'); if (!(await c.isChecked())) await c.check(); } catch {}
      }
      if (zeitraumMonate > 0) {
        const von = new Date();
        von.setMonth(von.getMonth() - zeitraumMonate);
        const vonStr = `${String(von.getDate()).padStart(2, "0")}.${String(von.getMonth() + 1).padStart(2, "0")}.${von.getFullYear()}`;
        try { await page.fill('input[name="bwt_DateVonId"]', vonStr); } catch {}
      }
      try { await page.click('input[name="radioAnsicht"][value="tabelle"]'); } catch {}

      // Submit + wait for the resulting navigation to complete
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }),
        page.click('input[name="rechercheStarten"]'),
      ]);
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => "");
      const pageText = (await page.textContent("body").catch(() => "")) ?? "";
      const noResults = /keine.*treffer|0 treffer|no.*result/i.test(pageText);

      // Extract Aktenzeichen from detail-page links (reliable regardless of table layout)
      const collectFromPage = async () => {
        const azLinks = await page.$$('a[href*="/DPMAregister/marke/register/"]');
        for (const link of azLinks) {
          const href = await link.getAttribute("href");
          const azMatch = href?.match(/\/marke\/register\/(\d{7,14})\//);
          if (!azMatch) continue;
          const az = azMatch[1];
          if (seenAz.has(az)) continue;
          seenAz.add(az);
          // Extract name + status from the row via in-page JS
          const rowData = await link.evaluate((el) => {
            const row = el.closest("tr");
            if (!row) return "";
            return Array.from(row.querySelectorAll("td"))
              .map((td) => td.textContent?.trim().replace(/\s+/g, " ") ?? "")
              .join("\t");
          });
          const parts = rowData.split("\t").filter((p) => p.length > 0);
          const azIdx = parts.findIndex((p) => p.replace(/\s/g, "") === az);
          const name = azIdx !== -1 ? (parts[azIdx + 1] ?? parts[0] ?? "") : (parts[1] ?? "");
          const status = azIdx !== -1 ? (parts[azIdx + 2] ?? null) : null;
          hits.push({ az, name: name.trim(), status: status?.trim() ?? null });
        }
      };

      if (!noResults) {
        while (true) {
          await collectFromPage();
          const next = await page.$('a:has-text(">>"), a:has-text("nächste"), a[title*="nächste"]');
          if (!next) break;
          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }),
              next.click(),
            ]);
            await page.waitForTimeout(1500);
          } catch { break; }
        }
      }

      const rowCount = (await page.$$("table tr")).length;
      diag = `„${pageTitle.slice(0, 35)}" · ${currentUrl.slice(-40)} · ${rowCount} Tabellenzeilen · ${noResults ? "keine Treffer" : hits.length + " AZ"}`;
    } catch (e) {
      diag = `Fehler: ${(e as Error).message.slice(0, 120)}`;
    }
    return { hits, diag };
  }

  // Einen einzigen Browser für alle Stämme → nur 1 WebSocket-Verbindung zu Browserless
  yield { type: "status", message: "Chrome wird gestartet (kann 10-20s dauern)…" };
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    yield { type: "error", message: `Browser-Start fehlgeschlagen: ${(e as Error).message.slice(0, 200)}` };
    yield { type: "done", totalFound: 0, newTrademarks: 0, updated: 0, errors: 1 };
    return;
  }
  yield { type: "status", message: "Chrome gestartet." };
  const ctx = await createStealthContext(browser);

  for (const stem of stems) {
    try {
      const s = stem.charAt(0).toUpperCase() + stem.slice(1).toLowerCase();
      // Phonetik auf 3 begrenzen um Browserless-Rate-Limits zu vermeiden
      const phonetic = getTopVariants(stem, 3).filter((v) => v.toLowerCase() !== stem.toLowerCase()).slice(0, 3);
      const searchTerms = [s, `${s}*`, `*${s}`, ...phonetic];
      yield { type: "status", message: `Suche nach „${stem}" — ${searchTerms.length} Begriffe (exakt, Wildcards, ${phonetic.length} phonetisch)` };

      // PHASE 1: Varianten sequentiell auf einer einzigen Tab durchsuchen
      const seenAz = new Set<string>();
      const basicHits: Array<{ az: string; name: string; status: string | null }> = [];

      let searchPage: Page | undefined;
      try {
        searchPage = await ctx.newPage();
        await addStealthScripts(searchPage);
      } catch (e) {
        yield { type: "error", message: `Suche „${stem}": Such-Tab konnte nicht geöffnet werden — ${(e as Error).message.slice(0, 150)}` };
        errorCount++;
        continue;
      }

      for (let i = 0; i < searchTerms.length; i++) {
        const v = searchTerms[i];
        yield { type: "status", message: `[${i + 1}/${searchTerms.length}] Suche: „${v}"` };
        const { hits, diag } = await searchOnPage(searchPage, v, seenAz);
        basicHits.push(...hits);
        yield { type: "status", message: `[${i + 1}/${searchTerms.length}] „${v}": ${diag}` };
        if (!browser.isConnected()) {
          yield { type: "error", message: `Suche „${stem}": Browser während Variantensuche getrennt` };
          errorCount++;
          break;
        }
        // Kurze Pause zwischen Anfragen um Bot-Detection zu reduzieren
        if (i < searchTerms.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }

      try { await searchPage.close(); } catch {}

      yield { type: "browser:loaded", trefferCount: basicHits.length };
      yield { type: "status", message: `${basicHits.length} Treffer aus ${searchTerms.length} Suchen. Lade Details…` };

      if (basicHits.length === 0 || !browser.isConnected()) {
        continue;
      }

      // PHASE 2: Detail-Seiten laden (sequentiell in einem Tab)
      let detailPage;
      try {
        detailPage = await ctx.newPage();
      } catch (e) {
        yield { type: "error", message: `Suche „${stem}": Detail-Tab konnte nicht geöffnet werden — ${(e as Error).message.slice(0, 150)}` };
        errorCount++;
        continue;
      }
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

      try { await detailPage.close(); } catch {}
      yield { type: "status", message: `${stem}: ${allHits.length} Treffer gesamt.` };
    } catch (e) {
      errorCount++;
      yield { type: "error", message: `Suche „${stem}": ${(e as Error).message.slice(0, 200)}` };
    }
  }

  try { await browser.close(); } catch {}
  yield { type: "status", message: "Chrome geschlossen." };

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
