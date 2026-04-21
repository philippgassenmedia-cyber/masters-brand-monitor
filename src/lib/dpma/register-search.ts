// Nicht-streamende DPMA-Registersuche (Fallback).
// Nutzt Playwright chromium mit headless=new Modus für register.dpma.de.

import { chromium } from "playwright-core";
import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { parseDpmaDetailPage } from "./detail-parser";
import { resolveCompanyProfile } from "../resolve-company";
import type { DpmaKurierHit } from "./types";

export interface DpmaSearchResult {
  totalFound: number;
  newTrademarks: number;
  updated: number;
  errors: string[];
}

export async function searchDpmaRegister(
  stems: string[],
  nizzaKlassen = "36 37 42",
): Promise<DpmaSearchResult> {
  const db = getSupabaseAdminClient();
  const result: DpmaSearchResult = {
    totalFound: 0,
    newTrademarks: 0,
    updated: 0,
    errors: [],
  };

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--headless=new",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  try {
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const allHits: DpmaKurierHit[] = [];
    const seenAz = new Set<string>();

    for (const stem of stems) {
      try {
        const page = await ctx.newPage();
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", { get: () => false });
          (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
        });

        await page.goto("https://register.dpma.de/DPMAregister/marke/basis", {
          timeout: 45_000,
        });
        await page.waitForSelector('input[name="marke"]', { timeout: 20_000 });

        await page.fill('input[name="marke"]', stem);
        await page.fill('input[name="klassen"]', nizzaKlassen);

        // Nur deutsche Marken
        const de = page.locator('input[name="demarke"]');
        if (!(await de.isChecked())) await de.check();
        const em = page.locator('input[name="emmarke"]');
        if (await em.isChecked()) await em.uncheck();
        const ir = page.locator('input[name="irmarke"]');
        if (await ir.isChecked()) await ir.uncheck();

        // Nur in Kraft befindliche Marken
        try {
          const c = page.locator('input[name="marke_inkraft_zeigen_chk"]');
          if (!(await c.isChecked())) await c.check();
        } catch {}

        // Zeitraum: letzte 3 Monate
        const von = new Date();
        von.setMonth(von.getMonth() - 3);
        const vonStr = `${String(von.getDate()).padStart(2, "0")}.${String(von.getMonth() + 1).padStart(2, "0")}.${von.getFullYear()}`;
        try {
          await page.fill('input[name="bwt_DateVonId"]', vonStr);
        } catch {}

        // Tabellenansicht
        try {
          await page.click('input[name="radioAnsicht"][value="tabelle"]');
        } catch {}

        await page.click('input[name="rechercheStarten"]');
        await page.waitForLoadState("networkidle", { timeout: 45_000 });
        await page.waitForTimeout(3000);

        // Ergebnisse aus Tabelle extrahieren
        while (true) {
          const rows = await page.$$("table tr");
          for (const row of rows) {
            const cells = await row.$$("td");
            if (cells.length < 4) continue;
            const cellTexts: string[] = [];
            for (const cell of cells) {
              cellTexts.push(
                (await cell.textContent())?.trim().replace(/\s+/g, " ") ?? "",
              );
            }
            const az = cellTexts[3]?.replace(/\s/g, "") ?? "";
            if (!az || !/^\d+$/.test(az) || seenAz.has(az)) continue;
            seenAz.add(az);

            allHits.push({
              aktenzeichen: az,
              markenname: cellTexts[4] ?? `[${az}]`,
              anmelder: null,
              anmeldetag: null,
              veroeffentlichungstag: null,
              status: cellTexts[5] ?? null,
              nizza_klassen: [],
              waren_dienstleistungen: null,
              inhaber_anschrift: null,
              vertreter: null,
              markenform: null,
              schutzdauer_bis: null,
            });
          }

          const next = await page.$(
            'a:has-text(">>"), a:has-text("nächste"), a[title*="nächste"]',
          );
          if (!next) break;
          try {
            await next.click();
            await page.waitForLoadState("networkidle", { timeout: 20_000 });
            await page.waitForTimeout(2000);
          } catch {
            break;
          }
        }

        // Detail-Seiten laden
        for (let i = 0; i < allHits.length; i++) {
          const hit = allHits[i];
          if (hit.anmelder !== null) continue; // Bereits mit Details gefüllt
          try {
            await page.goto(
              `https://register.dpma.de/DPMAregister/marke/register/${hit.aktenzeichen}/DE`,
              { timeout: 20_000 },
            );
            await page.waitForTimeout(2500);
            const rawText = (await page.textContent("body")) ?? "";
            const detail = parseDpmaDetailPage(rawText);

            hit.anmelder = detail.inhaber;
            hit.anmeldetag = detail.anmeldetag ?? detail.eintragungstag;
            hit.veroeffentlichungstag = detail.veroeffentlichungstag;
            hit.status = detail.aktenzustand ?? hit.status;
            hit.nizza_klassen = detail.klassen;
            hit.waren_dienstleistungen = detail.warenDienstleistungen;
            hit.inhaber_anschrift = detail.inhaberAnschrift;
            hit.vertreter = detail.vertreter;
            hit.markenform = detail.markenform;
            hit.schutzdauer_bis = detail.schutzendedatum;
          } catch {
            // Detail nicht ladbar — Basis-Daten reichen
          }
        }

        await page.close();
      } catch (e) {
        result.errors.push(`Suche "${stem}": ${(e as Error).message.slice(0, 200)}`);
      }
    }

    await browser.close();

    // Deduplizieren
    const seen = new Set<string>();
    const uniqueHits = allHits.filter((h) => {
      if (seen.has(h.aktenzeichen)) return false;
      seen.add(h.aktenzeichen);
      return true;
    });
    result.totalFound = uniqueHits.length;

    // Analyse und Speicherung
    for (const hit of uniqueHits) {
      try {
        const match = matchAgainstStems(hit.markenname, stems);

        const { data: existing } = await db
          .from("trademarks")
          .select("id")
          .eq("aktenzeichen", hit.aktenzeichen)
          .eq("markenstamm", match.stem)
          .maybeSingle();

        if (existing) {
          await db
            .from("trademarks")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", existing.id);
          result.updated++;
          continue;
        }

        const classification = await classifyTrademark(hit, match);

        const fristEnde = hit.schutzdauer_bis ??
          (hit.veroeffentlichungstag
            ? (() => {
                const d = new Date(hit.veroeffentlichungstag);
                if (isNaN(d.getTime())) return null;
                d.setMonth(d.getMonth() + 3);
                return d.toISOString().slice(0, 10);
              })()
            : null);

        // Website automatisch suchen bei relevantem Treffer
        let resolvedWebsite: string | null = null;
        if (
          classification.score >= 5 ||
          match.type === "exact" ||
          match.type === "compound"
        ) {
          try {
            const searchName =
              hit.markenname + (hit.anmelder ? ` ${hit.anmelder}` : "");
            const { resolvedUrl } = await resolveCompanyProfile(searchName);
            resolvedWebsite = resolvedUrl;
          } catch {
            // Website-Suche ist optional
          }
        }

        await db.from("trademarks").insert({
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
        });
        result.newTrademarks++;
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes("duplicate") && !msg.includes("unique")) {
          result.errors.push(`${hit.aktenzeichen}: ${msg.slice(0, 150)}`);
        }
      }
    }
  } catch (e) {
    try {
      await browser.close();
    } catch {}
    throw e;
  }

  return result;
}
