/**
 * Standalone DPMA Register-Scanner.
 * Läuft lokal oder in GitHub Actions mit echtem Chrome.
 * Ergebnisse werden direkt in Supabase gespeichert.
 *
 * Benötigte Env-Vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 *
 * Usage:
 *   npx tsx scripts/scan-dpma.ts
 *   npx tsx scripts/scan-dpma.ts --stems "master,masters"
 *   npx tsx scripts/scan-dpma.ts --klassen "36 37 42"
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// ── Config ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("❌ GEMINI_API_KEY muss gesetzt sein");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const stemsArg = getArg("stems", "master");
const stems = stemsArg.split(",").map(s => s.trim()).filter(Boolean);
const klassen = getArg("klassen", "36 37 42");
const isCI = !!process.env.CI || !!process.env.GITHUB_ACTIONS;

console.log(`🔍 DPMA Register-Scan`);
console.log(`   Stämme: ${stems.join(", ")}`);
console.log(`   Klassen: ${klassen}`);
console.log(`   Modus: ${isCI ? "CI (GitHub Actions)" : "Lokal"}`);
console.log();

// ── Varianten-Generator (vereinfacht) ───────────────────────
function getVariants(stem: string, max = 8): string[] {
  const variants = new Set<string>();
  variants.add(stem);
  const l = stem.toLowerCase();
  // Phonetische Substitutionen
  const subs: [string, string[]][] = [
    ["a", ["e", "o"]], ["e", ["a", "i"]], ["s", ["z", "ss"]],
    ["t", ["d"]], ["m", ["n"]], ["k", ["c"]], ["st", ["sst"]],
  ];
  for (const [from, tos] of subs) {
    const idx = l.indexOf(from);
    if (idx >= 0) {
      for (const to of tos) {
        variants.add(l.slice(0, idx) + to + l.slice(idx + from.length));
      }
    }
  }
  return [...variants].slice(0, max).map(v => v.charAt(0).toUpperCase() + v.slice(1));
}

// ── DPMA Detail-Parser ─────────────────────────────────────
function parseDetail(text: string) {
  const field = (label: string): string | null => {
    const re = new RegExp(label + "[:\\s]+([^\\n]+)", "i");
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };
  const klassenMatch = text.match(/Nizza[- ]Klasse[n]?[:\s]+([\d,\s]+)/i);
  const klassen = klassenMatch
    ? klassenMatch[1].split(/[,\s]+/).map(Number).filter(n => n > 0 && n <= 45)
    : [];
  return {
    inhaber: field("Inhaber") ?? field("INH"),
    anmeldetag: field("Anmeldetag") ?? field("AT"),
    eintragungstag: field("Eintragungstag") ?? field("ET"),
    veroeffentlichungstag: field("Tag der Veröffentlichung"),
    aktenzustand: field("Aktenzustand") ?? field("Aktenstatus"),
    klassen,
    warenDienstleistungen: field("Waren und Dienstleistungen") ?? field("WDV"),
    inhaberAnschrift: field("Zustellanschrift") ?? field("ZAN"),
    vertreter: field("Vertreter") ?? field("VTR"),
    markenform: field("Markenform") ?? field("MF"),
    schutzendedatum: field("Schutzdauer") ?? field("Ende der Schutzdauer"),
  };
}

// ── Matching ────────────────────────────────────────────────
function matchType(name: string, stems: string[]): { type: string; stem: string; details: string } {
  const lower = name.toLowerCase();
  for (const s of stems) {
    const sl = s.toLowerCase();
    if (lower === sl) return { type: "exact", stem: s, details: `Exakter Match: ${name}` };
    if (lower.includes(sl)) return { type: "compound", stem: s, details: `Enthält "${s}" in "${name}"` };
  }
  return { type: "fuzzy", stem: stems[0], details: `Ähnlich zu ${stems[0]}` };
}

// ── Gemini Klassifizierung ──────────────────────────────────
async function classify(hit: { markenname: string; aktenzeichen: string; anmelder: string | null; nizza_klassen: number[] }, match: { type: string; stem: string; details: string }) {
  const IMMO_KLASSEN = new Set([35, 36, 37, 42, 43]);
  const hasImmo = hit.nizza_klassen.some(k => IMMO_KLASSEN.has(k));

  const prompt = `Markenname: ${hit.markenname}\nAktenzeichen: ${hit.aktenzeichen}\n${hit.anmelder ? `Anmelder: ${hit.anmelder}` : ""}\nNizza-Klassen: ${hit.nizza_klassen.join(", ") || "keine"}\nImmobilien-Klasse: ${hasImmo ? "JA" : "NEIN"}\nMatch-Typ: ${match.type} — ${match.details}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `Bewerte DPMA-Markentreffer auf Relevanz für Wortmarke "MASTER" im Immobilien-Kontext. Score 0-10. Antworte NUR JSON: {"score":<0-10>,"branchenbezug":"<Branche>","prioritaet":"<low|medium|high|critical>","begruendung":"<2 Sätze>"}` }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      },
    );
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text);

    // Boosting
    let score = parsed.score ?? 5;
    let prio = parsed.prioritaet ?? "medium";
    if (match.type === "exact") { score = Math.max(score, hasImmo ? 9 : 8); prio = hasImmo ? "critical" : "high"; }
    else if (match.type === "compound") { score = Math.max(score, hasImmo ? 8 : 6); if (hasImmo) prio = "high"; }

    return { score, branchenbezug: parsed.branchenbezug ?? "", prioritaet: prio, begruendung: parsed.begruendung ?? "" };
  } catch (e) {
    const fallback = match.type === "exact" ? (hasImmo ? 9 : 8) : match.type === "compound" ? (hasImmo ? 8 : 6) : 5;
    return { score: fallback, branchenbezug: hasImmo ? "Immobilien" : "Unbekannt", prioritaet: match.type === "exact" ? "critical" : "medium", begruendung: `Auto-Score (Gemini error: ${(e as Error).message})` };
  }
}

// ── Hauptprogramm ───────────────────────────────────────────
async function main() {
  // Browser starten
  console.log("🌐 Starte Chrome…");
  const browser = await chromium.launch({
    headless: true,
    ...(isCI
      ? { args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] }
      : { channel: "chrome", args: ["--headless=new", "--disable-blink-features=AutomationControlled", "--no-sandbox"] }
    ),
  });

  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const seenAz = new Set<string>();
  interface BasicHit { az: string; name: string; status: string | null }
  const allBasicHits: BasicHit[] = [];

  // Phase 1: Suche im Register
  for (const stem of stems) {
    const variants = getVariants(stem, 6);
    console.log(`\n📋 Stamm "${stem}" — ${variants.length} Varianten`);

    for (const variant of variants) {
      console.log(`   🔎 Suche "${variant}"…`);
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
      });

      try {
        await page.goto("https://register.dpma.de/DPMAregister/marke/basis", { timeout: 45_000 });
        await page.waitForSelector('input[name="marke"]', { timeout: 20_000 });
        await page.fill('input[name="marke"]', variant);
        await page.fill('input[name="klassen"]', klassen);

        // Nur deutsche Marken
        const de = page.locator('input[name="demarke"]');
        if (!(await de.isChecked())) await de.check();
        const em = page.locator('input[name="emmarke"]');
        if (await em.isChecked()) await em.uncheck();
        const ir = page.locator('input[name="irmarke"]');
        if (await ir.isChecked()) await ir.uncheck();

        // Nur in Kraft
        try {
          const c = page.locator('input[name="marke_inkraft_zeigen_chk"]');
          if (!(await c.isChecked())) await c.check();
        } catch {}

        // Tabellenansicht
        try { await page.click('input[name="radioAnsicht"][value="tabelle"]'); } catch {}

        await page.click('input[name="rechercheStarten"]');
        await page.waitForLoadState("networkidle", { timeout: 45_000 });
        await page.waitForTimeout(3000);

        // Ergebnisse aus Tabelle
        let pageHits = 0;
        while (true) {
          const rows = await page.$$("table tr");
          for (const row of rows) {
            const cells = await row.$$("td");
            if (cells.length < 4) continue;
            const texts: string[] = [];
            for (const cell of cells) texts.push((await cell.textContent())?.trim().replace(/\s+/g, " ") ?? "");
            const az = texts[3]?.replace(/\s/g, "") ?? "";
            if (!az || !/^\d+$/.test(az) || seenAz.has(az)) continue;
            seenAz.add(az);
            allBasicHits.push({ az, name: texts[4] ?? "", status: texts[5] ?? null });
            pageHits++;
          }
          const next = await page.$('a:has-text(">>"), a:has-text("nächste"), a[title*="nächste"]');
          if (!next) break;
          try { await next.click(); await page.waitForLoadState("networkidle", { timeout: 20_000 }); await page.waitForTimeout(2000); } catch { break; }
        }
        console.log(`      ✅ ${pageHits} neue Treffer`);
      } catch (e) {
        console.log(`      ❌ ${(e as Error).message.slice(0, 100)}`);
      }
      await page.close();
    }
  }

  console.log(`\n📊 ${allBasicHits.length} Treffer gefunden. Lade Details…\n`);

  // Phase 2: Detail-Seiten
  interface FullHit extends BasicHit {
    inhaber: string | null; anmeldetag: string | null; klassen: number[];
    warenDienstleistungen: string | null; inhaberAnschrift: string | null;
    vertreter: string | null; markenform: string | null; schutzdauer_bis: string | null;
  }
  const fullHits: FullHit[] = [];
  const detailPage = await ctx.newPage();
  await detailPage.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
  });

  for (let i = 0; i < allBasicHits.length; i++) {
    const bh = allBasicHits[i];
    try {
      await detailPage.goto(`https://register.dpma.de/DPMAregister/marke/register/${bh.az}/DE`, { timeout: 20_000 });
      await detailPage.waitForTimeout(2500);
      const rawText = await detailPage.textContent("body") ?? "";
      const d = parseDetail(rawText);
      console.log(`   [${i + 1}/${allBasicHits.length}] ${bh.name || bh.az} — ${d.inhaber?.slice(0, 40) ?? "—"}`);
      fullHits.push({
        ...bh, inhaber: d.inhaber, anmeldetag: d.anmeldetag ?? d.eintragungstag,
        klassen: d.klassen, warenDienstleistungen: d.warenDienstleistungen,
        inhaberAnschrift: d.inhaberAnschrift, vertreter: d.vertreter,
        markenform: d.markenform, schutzdauer_bis: d.schutzendedatum,
      });
    } catch {
      console.log(`   [${i + 1}/${allBasicHits.length}] ${bh.az} — ⚠️ Detail nicht ladbar`);
      fullHits.push({ ...bh, inhaber: null, anmeldetag: null, klassen: [], warenDienstleistungen: null, inhaberAnschrift: null, vertreter: null, markenform: null, schutzdauer_bis: null });
    }
  }

  await browser.close();
  console.log("\n🌐 Chrome geschlossen.\n");

  // Phase 3: Analyse + Supabase
  let newCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < fullHits.length; i++) {
    const h = fullHits[i];
    const match = matchType(h.name || h.az, stems);

    try {
      const { data: existing } = await db
        .from("trademarks").select("id")
        .eq("aktenzeichen", h.az).eq("markenstamm", match.stem)
        .maybeSingle();

      if (existing) {
        await db.from("trademarks").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
        updatedCount++;
        console.log(`   [${i + 1}] ${h.name} — ♻️ Aktualisiert`);
        continue;
      }

      // Gemini Klassifizierung (2s Delay)
      await new Promise(r => setTimeout(r, 2000));
      const cl = await classify(
        { markenname: h.name || h.az, aktenzeichen: h.az, anmelder: h.inhaber, nizza_klassen: h.klassen },
        match,
      );

      await db.from("trademarks").insert({
        aktenzeichen: h.az,
        markenname: h.name || `[${h.az}]`,
        anmelder: h.inhaber,
        anmeldetag: h.anmeldetag,
        status: h.status,
        nizza_klassen: h.klassen,
        waren_dienstleistungen: h.warenDienstleistungen,
        inhaber_anschrift: h.inhaberAnschrift,
        vertreter: h.vertreter,
        markenform: h.markenform,
        schutzdauer_bis: h.schutzdauer_bis,
        quelle: "dpma_register",
        match_type: match.type,
        markenstamm: match.stem,
        register_url: `https://register.dpma.de/DPMAregister/marke/register/${h.az}/DE`,
        relevance_score: cl.score,
        branchenbezug: cl.branchenbezug,
        prioritaet: cl.prioritaet,
        begruendung: cl.begruendung,
      });
      newCount++;
      console.log(`   [${i + 1}] ${h.name} — ✅ Score ${cl.score} (${cl.prioritaet})`);
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        errorCount++;
        console.log(`   [${i + 1}] ${h.az} — ❌ ${msg.slice(0, 80)}`);
      }
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ Fertig!`);
  console.log(`   Gefunden: ${fullHits.length}`);
  console.log(`   Neu:      ${newCount}`);
  console.log(`   Updated:  ${updatedCount}`);
  console.log(`   Fehler:   ${errorCount}`);
  console.log(`════════════════════════════════════════\n`);
}

main().catch((e) => {
  console.error("💥 Fatal:", e);
  process.exit(1);
});
