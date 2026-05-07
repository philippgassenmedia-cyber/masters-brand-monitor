/**
 * DPMA Scan Agent — läuft lokal im Hintergrund.
 * Holt Konfiguration automatisch vom Server — keine .env Datei nötig.
 *
 * Starten (Befehl wird in der Web-UI generiert):
 *   npx tsx scripts/dpma-agent.ts DEIN_AGENT_TOKEN
 */
import { chromium } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const POLL_INTERVAL = 30_000;

// ── Konfiguration laden ─────────────────────────────────────
let SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
let GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error("❌ Konfiguration fehlt.");
  console.error("   Kopiere den Startbefehl aus den Einstellungen der Web-Oberfläche.");
  console.error("   (Einstellungen → DPMA Register-Agent → Einrichtung)");
  process.exit(1);
}

const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`\n🤖 DPMA Scan Agent gestartet`);
console.log(`   Supabase: ${SUPABASE_URL.slice(0, 30)}…`);
console.log(`   Prüfe alle ${POLL_INTERVAL / 1000}s auf neue Aufträge…`);
console.log(`   Stoppen: Strg+C / Ctrl+C\n`);

// ── Hilfsfunktionen ─────────────────────────────────────────
function getVariants(stem: string, max = 6): string[] {
  const v = new Set<string>(); v.add(stem);
  const l = stem.toLowerCase();
  for (const [f, ts] of [["a",["e","o"]],["e",["a","i"]],["s",["z"]],["t",["d"]],["m",["n"]]] as [string,string[]][]) {
    const i = l.indexOf(f); if (i >= 0) for (const t of ts) v.add(l.slice(0,i)+t+l.slice(i+f.length));
  }
  return [...v].slice(0, max).map(s => s.charAt(0).toUpperCase()+s.slice(1));
}

function parseDetail(text: string) {
  const f = (l: string) => { const m = text.match(new RegExp(l+"[:\\s]+([^\\n]+)","i")); return m?m[1].trim():null; };
  const km = text.match(/Nizza[- ]Klasse[n]?[:\s]+([\d,\s]+)/i);
  return { inhaber: f("Inhaber")??f("INH"), klassen: km?km[1].split(/[,\s]+/).map(Number).filter(n=>n>0&&n<=45):[], status: f("Aktenzustand") };
}

function matchType(name: string, stems: string[]) {
  const l = name.toLowerCase();
  for (const s of stems) { if (l===s.toLowerCase()) return {type:"exact",stem:s}; if (l.includes(s.toLowerCase())) return {type:"compound",stem:s}; }
  return {type:"fuzzy",stem:stems[0]};
}

const CLASSIFY_PROMPT = `Bewerte ob eine DPMA/EUIPO-Marke Verwechslungsgefahr mit "MASTER" (geschützt für Immobilien & Beratung) darstellt.

NIZZA-KLASSEN — Priorität in dieser Reihenfolge:
Klasse 36 (Immobilien, Finanzen, Versicherungen) → HÖCHSTE Priorität, Score 7-10 wenn "Master" klar als Marke genutzt wird
Klasse 37 (Bau, Bauleitung, Reparatur) → HOHE Priorität, Score 6-9
Klasse 42 (Technische/wissenschaftliche Dienstleistungen) → MITTLERE Priorität, Score 5-8
Klasse 35 (Unternehmensberatung, Bürodienstleistungen, Vermittlung) → MITTLERE Priorität, Score 5-7
Andere Klassen (43=Gastronomie, 25=Bekleidung, 9=Software usw.) → KEINE Verletzung der geschützten Bereiche → Score 0-3

WICHTIG:
- "Master" in Zusammensetzungen wie Mastercard, Webmaster, Masterclass → Score 0-2 (Fremdmarke/generisch)
- Wenn Klassen angegeben sind und KEINE davon 35, 36, 37, 42 enthält → Score MAXIMAL 3
- Wenn hasImmo=JA (Klasse 35/36/37/42 vorhanden) → Score mindestens 6 bei eindeutigem Markennamen
- Andere Branchen (IT, Gaming, Food, Mode) ohne Klasse 35/36/37/42 → Score 0-3

JSON: {"score":<0-10>,"branchenbezug":"<erkannte Branche>","prioritaet":"<low|medium|high|critical>","begruendung":"<warum relevant oder nicht, Klassen berücksichtigen>"}`;

async function classify(name: string, az: string, inhaber: string|null, klassen: number[], match: {type:string}) {
  const IMMO = new Set([35,36,37,42]); const hasImmo = klassen.some(k=>IMMO.has(k));
  // Trademarks in irrelevant classes only → hard cap at 3
  const hasOtherClassOnly = klassen.length > 0 && !hasImmo;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({systemInstruction:{parts:[{text:CLASSIFY_PROMPT}]},
        contents:[{role:"user",parts:[{text:`Marke: ${name}\nAZ: ${az}\n${inhaber?`Inhaber: ${inhaber}`:""}\nKlassen: ${klassen.join(", ")||"keine"}\nImmo-Klasse (35/36/37/42): ${hasImmo?"JA":"NEIN"}\nMatch: ${match.type}`}]}],
        generationConfig:{responseMimeType:"application/json",temperature:0.2}})});
    if(!r.ok) throw new Error(`${r.status}`);
    const p = JSON.parse((await r.json()).candidates?.[0]?.content?.parts?.[0]?.text??"{}");
    let sc=p.score??5,pr=p.prioritaet??"medium";
    const geminiImmo = /immobili|makler|hausverwalt|beratung|consulting/i.test(p.branchenbezug??"");
    if(match.type==="exact"&&hasImmo&&geminiImmo){sc=Math.max(sc,9);pr="critical";}
    else if(match.type==="exact"&&hasImmo){sc=Math.max(sc,7);}
    else if(match.type==="compound"&&hasImmo&&geminiImmo){sc=Math.max(sc,7);pr=pr==="low"?"high":pr;}
    // Hard cap: irrelevant classes cannot exceed 3
    if(hasOtherClassOnly) sc=Math.min(sc,3);
    return {score:sc,branchenbezug:p.branchenbezug??"",prioritaet:pr,begruendung:p.begruendung??""};
  } catch { return {score:match.type==="exact"?(hasImmo?7:3):hasImmo?4:2,branchenbezug:hasImmo?"Immobilien-Klasse":"?",prioritaet:"medium",begruendung:"Auto"}; }
}

// ── Details + Klassifizierung + DB-Insert für einen Cluster ──
async function processClusterHits(
  stemHits: Array<{az:string;name:string;st:string|null}>,
  stems: string[],
  dPage: import("playwright").Page,
): Promise<{newC:number;updC:number;errors:number}> {
  let newC=0,updC=0,errors=0;
  for(let i=0;i<stemHits.length;i++){
    const h=stemHits[i];let inh:string|null=null;let kl:number[]=[];
    try{await dPage.goto(`https://register.dpma.de/DPMAregister/marke/register/${h.az}/DE`,{timeout:20000});await dPage.waitForTimeout(2500);const d=parseDetail(await dPage.textContent("body")??"");inh=d.inhaber;kl=d.klassen;}catch{}
    const m=matchType(h.name||h.az,stems);
    try{
      const{data:ex,error:selErr}=await db.from("trademarks").select("id").eq("aktenzeichen",h.az).eq("markenstamm",m.stem).maybeSingle();
      if(selErr){console.log(`      ⚠️ DB-Lesefehler: ${selErr.message}`);errors++;continue;}
      if(ex){const{error:updErr}=await db.from("trademarks").update({last_seen_at:new Date().toISOString()}).eq("id",ex.id);if(updErr)console.log(`      ⚠️ Update-Fehler: ${updErr.message}`);updC++;continue;}
      await new Promise(r=>setTimeout(r,2000));
      const cl=await classify(h.name||h.az,h.az,inh,kl,m);
      const{error:insErr}=await db.from("trademarks").insert({aktenzeichen:h.az,markenname:h.name||`[${h.az}]`,anmelder:inh,status:h.st,nizza_klassen:kl,quelle:"dpma_register",match_type:m.type,markenstamm:m.stem,register_url:`https://register.dpma.de/DPMAregister/marke/register/${h.az}/DE`,relevance_score:cl.score,branchenbezug:cl.branchenbezug,prioritaet:cl.prioritaet,begruendung:cl.begruendung});
      if(insErr){console.log(`      ❌ Insert-Fehler: ${insErr.message}`);errors++;continue;}
      newC++;console.log(`      ✅ [${i+1}/${stemHits.length}] ${h.name} → Score ${cl.score} (${cl.prioritaet})`);
    }catch(e){if(!(e as Error).message.includes("duplicate"))errors++;}
  }
  return {newC,updC,errors};
}

// ── EUIPO Search via REST API ────────────────────────────────
async function searchEuipoApi(
  term: string,
  klassen: number[],
): Promise<Array<{az:string;name:string;inhaber:string|null;status:string|null;nizzaKlassen:number[]}>> {
  const PAGE = 100;
  const out: Array<{az:string;name:string;inhaber:string|null;status:string|null;nizzaKlassen:number[]}> = [];
  for (let p = 0; p < 5; p++) {
    const url = new URL("https://euipo.europa.eu/copla/trademark/data/trademarkSearch");
    url.searchParams.set("trademarkName", term);
    url.searchParams.set("pageSize", String(PAGE));
    url.searchParams.set("pageNumber", String(p));
    url.searchParams.set("language", "de");
    for (const k of klassen) url.searchParams.append("niceClass", String(k));
    const r = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Referer": "https://euipo.europa.eu/eSearch/",
        "Origin": "https://euipo.europa.eu",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`EUIPO API ${r.status} ${r.statusText}`);
    const d = await r.json() as {
      totalElements?: number;
      trademarks?: Array<{applicationNumber?:string;trademarkName?:string;applicantName?:string;trademarkStatus?:string;niceClasses?:number[]}>;
    };
    const ts = d.trademarks ?? [];
    for (const t of ts) {
      const az = String(t.applicationNumber ?? "").replace(/\s/g, "");
      if (!az) continue;
      out.push({az, name: String(t.trademarkName ?? ""), inhaber: t.applicantName ?? null, status: t.trademarkStatus ?? null, nizzaKlassen: Array.isArray(t.niceClasses) ? t.niceClasses.map(Number) : []});
    }
    const total = d.totalElements ?? 0;
    if (out.length >= total || ts.length < PAGE) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  return out;
}

async function processEuipoClusterHits(
  hits: Array<{az:string;name:string;inhaber:string|null;status:string|null;nizzaKlassen:number[]}>,
  stems: string[],
): Promise<{newC:number;updC:number;errors:number}> {
  let newC=0,updC=0,errors=0;
  for (let i=0; i<hits.length; i++) {
    const h = hits[i];
    const m = matchType(h.name||h.az, stems);
    try {
      const {data:ex,error:selErr} = await db.from("trademarks").select("id").eq("aktenzeichen",h.az).eq("markenstamm",m.stem).maybeSingle();
      if (selErr) {console.log(`      ⚠️ DB-Lesefehler: ${selErr.message}`);errors++;continue;}
      if (ex) {const{error:updErr}=await db.from("trademarks").update({last_seen_at:new Date().toISOString()}).eq("id",ex.id);if(updErr)console.log(`      ⚠️ Update-Fehler: ${updErr.message}`);updC++;continue;}
      await new Promise(r=>setTimeout(r,2000));
      const cl = await classify(h.name||h.az, h.az, h.inhaber, h.nizzaKlassen, m);
      const {error:insErr} = await db.from("trademarks").insert({
        aktenzeichen: h.az, markenname: h.name||`[EUTM ${h.az}]`, anmelder: h.inhaber, status: h.status,
        nizza_klassen: h.nizzaKlassen, quelle: "euipo", match_type: m.type, markenstamm: m.stem,
        register_url: `https://euipo.europa.eu/eSearch/#details/trademarks/${h.az}`,
        relevance_score: cl.score, branchenbezug: cl.branchenbezug, prioritaet: cl.prioritaet, begruendung: cl.begruendung,
      });
      if (insErr) {console.log(`      ❌ Insert-Fehler: ${insErr.message}`);errors++;continue;}
      newC++;
      console.log(`      ✅ [${i+1}/${hits.length}] ${h.name} → Score ${cl.score} (${cl.prioritaet})`);
    } catch(e){if(!(e as Error).message.includes("duplicate"))errors++;}
  }
  return {newC,updC,errors};
}

async function runEuipoScan(scanId: string, klassen = [35,36,37,42]) {
  console.log(`\n🌍 EUIPO Scan ${scanId.slice(0,8)}… gestartet`);
  await db.from("scheduled_scans").update({status:"running",started_at:new Date().toISOString()}).eq("id",scanId);

  const {data:sd} = await db.from("brand_stems").select("stamm").eq("aktiv",true);
  const stems = (sd??[]).map(s=>s.stamm as string); if(!stems.length) stems.push("master");

  const seenAz = new Set<string>();
  let totalFound=0,totalNew=0,totalUpdated=0,totalErrors=0;

  for (const stem of stems) {
    console.log(`\n📌 EUIPO Cluster „${stem}":`);
    const vars = getVariants(stem, 6);
    const stemHits: Array<{az:string;name:string;inhaber:string|null;status:string|null;nizzaKlassen:number[]}> = [];

    for (let vi=0; vi<vars.length; vi++) {
      if (vi>0){console.log(`   ⏳ 5s Pause…`);await new Promise(r=>setTimeout(r,5000));}
      console.log(`   🔎 "${vars[vi]}"…`);
      try {
        const hits = await searchEuipoApi(vars[vi], klassen);
        const newOnes = hits.filter(h => !seenAz.has(h.az));
        newOnes.forEach(h => seenAz.add(h.az));
        stemHits.push(...newOnes);
        console.log(`      ✅ ${newOnes.length} Treffer`);
        // Sofort klassifizieren + speichern
        if (newOnes.length > 0) {
          console.log(`   📊 ${newOnes.length} Treffer → Klassifizierung + Speicherung…`);
          const {newC,updC,errors} = await processEuipoClusterHits(newOnes, stems);
          totalFound += newOnes.length; totalNew += newC; totalUpdated += updC; totalErrors += errors;
          console.log(`   ✓ ${newC} neu gespeichert, ${updC} bekannt`);
        }
      } catch(e){totalErrors++;console.log(`      ❌ ${(e as Error).message.slice(0,80)}`);}
    }
    if (stemHits.length === 0) console.log(`   — Keine neuen Treffer für „${stem}"`);
  }

  await db.from("scheduled_scans").update({
    status: totalErrors > 0 ? "partial" : "completed",
    completed_at: new Date().toISOString(),
    result: {found:totalFound,new:totalNew,updated:totalUpdated,errors:totalErrors},
  }).eq("id",scanId);
  console.log(`\n✅ EUIPO Scan abgeschlossen: ${totalNew} neu, ${totalUpdated} aktualisiert, ${totalErrors} Fehler\n`);
}

// ── DPMA Scan ───────────────────────────────────────────────
async function runDpmaScan(scanId: string) {
  console.log(`\n🔍 Scan ${scanId.slice(0,8)}… gestartet`);
  await db.from("scheduled_scans").update({status:"running",started_at:new Date().toISOString()}).eq("id",scanId);

  const {data:sd} = await db.from("brand_stems").select("stamm").eq("aktiv",true);
  const stems = (sd??[]).map(s=>s.stamm as string); if(!stems.length) stems.push("master");

  const browser = await chromium.launch({headless:true,channel:"chrome",args:["--headless=new","--disable-blink-features=AutomationControlled","--no-sandbox"]});
  const seenAz = new Set<string>();
  let totalFound=0,totalNew=0,totalUpdated=0,totalErrors=0;

  // Detail-Browser für alle Cluster wiederverwenden
  const dCtx = await browser.newContext({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"});
  const dPage = await dCtx.newPage();
  await dPage.addInitScript(()=>{Object.defineProperty(navigator,"webdriver",{get:()=>false});});

  for (const stem of stems) {
    console.log(`\n📌 Cluster „${stem}":`);
    const vars = getVariants(stem,6);

    for (let vi=0;vi<vars.length;vi++) {
      if(vi>0){console.log(`   ⏳ 15s Pause…`);await new Promise(r=>setTimeout(r,15000));}
      const ctx = await browser.newContext({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"});
      const page = await ctx.newPage();
      await page.addInitScript(()=>{Object.defineProperty(navigator,"webdriver",{get:()=>false});(window as unknown as Record<string,unknown>).chrome={runtime:{}};});
      const varHits: Array<{az:string;name:string;st:string|null}> = [];
      try {
        console.log(`   🔎 "${vars[vi]}"…`);
        await page.goto("https://register.dpma.de/DPMAregister/marke/basis",{timeout:45000});
        // Accept cookie consent if present (DPMA shows banner on first visit)
        try {
          const consent = page.locator('button:has-text("Akzeptieren"), button:has-text("Zustimmen"), button:has-text("Alle akzeptieren"), button:has-text("Ich stimme zu"), a:has-text("Akzeptieren")');
          await consent.first().click({timeout:4000});
          await page.waitForTimeout(1000);
        } catch { /* no banner */ }
        // Wait for the actual search form (up to 15s)
        try {
          await page.waitForSelector('input[name="marke"]',{timeout:15000});
        } catch {
          const title = await page.title();
          console.log(`      ⚠️ Kein Formular (Seite: "${title}")`);
          continue;
        }
        await page.fill('input[name="marke"]',vars[vi]);
        await page.fill('input[name="klassen"]',"35 36 37 42");
        const de=page.locator('input[name="demarke"]');if(!(await de.isChecked()))await de.check();
        try{const em=page.locator('input[name="emmarke"]');if(await em.isChecked())await em.uncheck();}catch{}
        try{const ir=page.locator('input[name="irmarke"]');if(await ir.isChecked())await ir.uncheck();}catch{}
        try{const c=page.locator('input[name="marke_inkraft_zeigen_chk"]');if(!(await c.isChecked()))await c.check();}catch{}
        try{await page.click('input[name="radioAnsicht"][value="tabelle"]');}catch{}
        await page.click('input[name="rechercheStarten"]');
        await page.waitForLoadState("networkidle",{timeout:45000});
        await page.waitForTimeout(3000);
        let c=0;
        while(true){
          for(const row of await page.$$("table tr")){
            const cells=await row.$$("td");if(cells.length<4)continue;
            const t:string[]=[];for(const cl of cells)t.push((await cl.textContent())?.trim().replace(/\s+/g," ")??"");
            const az=t[3]?.replace(/\s/g,"")??"";if(!az||!/^\d+$/.test(az)||seenAz.has(az))continue;
            seenAz.add(az);varHits.push({az,name:t[4]??"",st:t[5]??null});c++;
          }
          const nx=await page.$('a:has-text(">>"), a:has-text("nächste")');if(!nx)break;
          try{await nx.click();await page.waitForLoadState("networkidle",{timeout:20000});await page.waitForTimeout(2000);}catch{break;}
        }
        console.log(`      ✅ ${c} Treffer`);
      } catch(e){totalErrors++;console.log(`      ❌ ${(e as Error).message.slice(0,80)}`);}
      await page.close(); await ctx.close();

      // Sofort klassifizieren + speichern — nicht warten bis alle Varianten durch sind
      if (varHits.length > 0) {
        console.log(`   📊 ${varHits.length} Treffer → Klassifizierung + Speicherung…`);
        const {newC,updC,errors} = await processClusterHits(varHits, stems, dPage);
        totalFound += varHits.length; totalNew += newC; totalUpdated += updC; totalErrors += errors;
        console.log(`   ✓ ${newC} neu gespeichert, ${updC} bekannt`);
      }
    }
  }

  await dPage.close(); await dCtx.close();
  await browser.close();
  await db.from("scheduled_scans").update({
    status: totalErrors > 0 ? "partial" : "completed",
    completed_at: new Date().toISOString(),
    result: {found:totalFound,new:totalNew,updated:totalUpdated,errors:totalErrors},
  }).eq("id",scanId);
  console.log(`\n✅ Scan abgeschlossen: ${totalNew} neu, ${totalUpdated} aktualisiert, ${totalErrors} Fehler\n`);
}

// ── Handelsregister Scan ─────────────────────────────────────
const HR_CLASSIFY_PROMPT = `Du bewertest ob eine im deutschen Handelsregister eingetragene Firma Verwechslungsgefahr mit der Wortmarke "MASTER" (geschützt für Immobilien & Beratung) darstellt.

Score 9-10: "Master" prominent im Firmennamen + eindeutiger Immobilienbezug (Makler, Hausverwaltung, Bauträger, Real Estate)
Score 7-8: "Master" im Namen + starker Beratungs- oder Immobilienbezug erkennbar
Score 5-6: "Master" im Namen + möglicher Bezug zu geschützten Bereichen, Branche unklar
Score 3-4: "Master" im Namen, klar andere Branche (Gastronomie, Handel, IT, Handwerk)
Score 1-2: "Master" ist Teil einer Fremdmarke (Mastercard, Webmaster) oder rein generisch

JSON: {"score":<0-10>,"branchenbezug":"<erkannte Branche oder 'unklar'>","prioritaet":"<low|medium|high|critical>","begruendung":"<1-2 Sätze>"}`;

async function classifyHrCompany(name: string, sitz: string, registerArt: string): Promise<{score:number;branchenbezug:string;prioritaet:string;begruendung:string}> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({systemInstruction:{parts:[{text:HR_CLASSIFY_PROMPT}]},
        contents:[{role:"user",parts:[{text:`Firma: ${name}\nSitz: ${sitz||"unbekannt"}\nRegisterart: ${registerArt}`}]}],
        generationConfig:{responseMimeType:"application/json",temperature:0.2}})});
    if(!r.ok) throw new Error(`${r.status}`);
    const p = JSON.parse((await r.json()).candidates?.[0]?.content?.parts?.[0]?.text??"{}");
    return {score:p.score??3,branchenbezug:p.branchenbezug??"?",prioritaet:p.prioritaet??"low",begruendung:p.begruendung??""};
  } catch { return {score:3,branchenbezug:"?",prioritaet:"low",begruendung:"Auto"}; }
}

async function runHandelsregisterScan(scanId: string) {
  console.log(`\n📋 Handelsregister Scan ${scanId.slice(0,8)}… gestartet`);
  await db.from("scheduled_scans").update({status:"running",started_at:new Date().toISOString()}).eq("id",scanId);

  const {data:sd} = await db.from("brand_stems").select("stamm").eq("aktiv",true);
  const stems = (sd??[]).map(s=>s.stamm as string); if(!stems.length) stems.push("master");

  const browser = await chromium.launch({headless:true,channel:"chrome",args:["--headless=new","--disable-blink-features=AutomationControlled","--no-sandbox"]});
  const ctx = await browser.newContext({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"});
  const page = await ctx.newPage();
  await page.addInitScript(()=>{Object.defineProperty(navigator,"webdriver",{get:()=>false});(window as unknown as Record<string,unknown>).chrome={runtime:{}};});

  let totalFound=0, totalNew=0, totalErrors=0;
  const seenKeys = new Set<string>();

  for (const stem of stems) {
    console.log(`\n📌 Handelsregister Cluster „${stem}":`);
    try {
      // Try current URL first, fall back to old one
      let loaded = false;
      for (const url of [
        "https://www.handelsregister.de/rp_web/welcome.xhtml",
        "https://www.handelsregister.de/rp_web/mask.do",
        "https://www.handelsregister.de",
      ]) {
        try {
          await page.goto(url, {timeout:30000});
          await page.waitForTimeout(2000);
          loaded = true;
          break;
        } catch { /* try next */ }
      }
      if (!loaded) { console.log(`   ⚠️ Seite nicht erreichbar`); totalErrors++; continue; }

      // Accept cookie consent if present
      try {
        const consent = page.locator('button:has-text("Akzeptieren"), button:has-text("Alle akzeptieren"), button:has-text("Ich stimme zu"), button:has-text("Accept")');
        await consent.first().click({timeout:3000});
        await page.waitForTimeout(1000);
      } catch {}
      // Wait for search form — try multiple known selectors across redesigns
      const INPUT_SELECTORS = [
        'input[name="stichwort"]',
        'input[name="schlagwoerter"]',
        'input[id*="stichwort"]',
        'input[id*="schlagwort"]',
        'input[id*="schlagwoerter"]',
        'input[name*="schlagwort"]',
        'input[id*="terms"]',
        'input[name="terms"]',
        'input[placeholder*="tichwort"]',
        'input[placeholder*="uche"]',
      ];
      const SUBMIT_SELECTORS = [
        'input[type="submit"][value*="Suchen"]',
        'input[type="submit"][value*="suchen"]',
        'button[type="submit"]:has-text("Suchen")',
        'button:has-text("Suchen")',
        'input[name*="suchen"]',
        'input[name*="Suchen"]',
        'button[id*="uche"]',
        'input[type="submit"]',
      ];
      let foundInput = false;
      for (const sel of INPUT_SELECTORS) {
        try { await page.waitForSelector(sel, {timeout:3000}); foundInput = true; break; } catch { /* next */ }
      }
      if (!foundInput) {
        // Debug: show what inputs exist on page
        const allInputs = await page.$$eval('input', els => els.map(e => `${e.tagName}[name="${e.getAttribute('name')}" id="${e.getAttribute('id')}" type="${e.getAttribute('type')}"]`));
        console.log(`   ⚠️ Kein Suchformular gefunden. URL: ${page.url()}`);
        console.log(`   🔍 Gefundene Inputs: ${allInputs.slice(0,8).join(' | ') || '(keine)'}`);
        totalErrors++;
        continue;
      }
      // Fill search term
      const searchInput = page.locator(INPUT_SELECTORS.join(', '));
      await searchInput.first().fill(stem);
      // Submit — try each selector
      let clicked = false;
      for (const sel of SUBMIT_SELECTORS) {
        try { await page.locator(sel).first().click({timeout:2000}); clicked = true; break; } catch { /* next */ }
      }
      if (!clicked) { console.log(`   ⚠️ Submit-Button nicht gefunden`); totalErrors++; continue; }
      await page.waitForLoadState("networkidle",{timeout:30000});
      await page.waitForTimeout(3000);

      let clusterFound=0;
      // Paginate through results
      while (true) {
        const rows = await page.$$("table.RegPortErg tr, table tr");
        for (const row of rows) {
          const cells = await row.$$("td");
          if (cells.length < 3) continue;
          const cellTexts = await Promise.all(cells.map(c=>c.textContent().then(t=>(t??'').trim().replace(/\s+/g,' '))));
          // Find the cell that contains the stem
          const nameCellIdx = cellTexts.findIndex(t=>t.toLowerCase().includes(stem.toLowerCase())&&t.length>3);
          if (nameCellIdx < 0) continue;
          const companyName = cellTexts[nameCellIdx];
          // Dedup key
          const key = companyName.toLowerCase().replace(/\s+/g,'');
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          // Extract other fields: registerArt (HRB/HRA), regNr, sitz
          const registerArt = cellTexts.find(t=>/^HRB?$|^HRA?$|^GnR$|^PR$/i.test(t))??cellTexts.find(t=>/HRB|HRA/i.test(t))??"HRB";
          const regNr = cellTexts.find(t=>/^\d{3,}$/.test(t))||"";
          const sitz = cellTexts.find(t=>t.length>2&&t!==companyName&&!/^HRB?$|^HRA?$/i.test(t)&&!/^\d+$/.test(t)&&t!==registerArt)??'';
          totalFound++; clusterFound++;
          // Classify
          await new Promise(r=>setTimeout(r,1500));
          const cl = await classifyHrCompany(companyName, sitz, registerArt);
          // Unique URL based on company + court info
          const urlKey = `https://www.handelsregister.de/rp_web/search.do?stichwort=${encodeURIComponent(companyName)}`;
          const violCat = cl.score>=9?"clear_violation":cl.score>=7?"suspected_violation":cl.score>=5?"borderline":cl.score>=3?"other_industry":"not_relevant";
          // Check for existing
          const {data:ex} = await db.from("hits").select("id").eq("url",urlKey).maybeSingle();
          if(ex){totalFound--;continue;}
          const {error:insErr} = await db.from("hits").insert({
            url:urlKey, domain:"www.handelsregister.de",
            title:companyName,
            snippet:`${registerArt} ${regNr} — ${sitz}`.replace(/\s{2,}/g,' ').trim(),
            company_name:companyName, address:sitz||null,
            ai_score:cl.score, ai_is_violation:cl.score>=6,
            ai_reasoning:cl.begruendung,
            ai_recommendation:cl.prioritaet==="critical"?"Anwalt einschalten":cl.prioritaet==="high"?"Anwalt informieren, prüfen lassen":"Beobachten",
            ai_violation_category:violCat, ai_model:"handelsregister",
            ai_analyzed_at:new Date().toISOString(),
            is_violation:cl.score>=6, status:"new",
          });
          if(insErr){if(!insErr.message.includes("duplicate")){console.log(`      ❌ Insert: ${insErr.message}`);totalErrors++;}}
          else{totalNew++;console.log(`      ✅ ${companyName} — ${sitz} → Score ${cl.score} (${cl.prioritaet})`);}
        }
        // Next page
        const nx = await page.$('a:has-text("Weiter"), a:has-text(">>"), a[title*="nächste"]');
        if(!nx) break;
        try{await nx.click();await page.waitForLoadState("networkidle",{timeout:20000});await page.waitForTimeout(2000);}catch{break;}
      }
      console.log(`   ✓ ${clusterFound} gefunden für „${stem}"`);
    } catch(e){console.log(`   ❌ ${(e as Error).message.slice(0,80)}`);totalErrors++;}
    if(stems.indexOf(stem)<stems.length-1){console.log(`   ⏳ 10s Pause…`);await new Promise(r=>setTimeout(r,10000));}
  }

  await page.close(); await ctx.close(); await browser.close();
  await db.from("scheduled_scans").update({
    status:totalErrors>0?"partial":"completed",
    completed_at:new Date().toISOString(),
    result:{found:totalFound,new:totalNew,errors:totalErrors},
  }).eq("id",scanId);
  console.log(`\n✅ Handelsregister Scan: ${totalNew} neu, ${totalErrors} Fehler\n`);
}

// ── Poll Loop ───────────────────────────────────────────────
async function poll() {
  try {
    // Only pick up jobs scheduled within the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const {data} = await db.from("scheduled_scans").select("id,scan_type")
      .eq("status","pending").in("scan_type",["dpma","euipo","handelsregister","all"])
      .gte("scheduled_at", twoHoursAgo)
      .lte("scheduled_at",new Date().toISOString())
      .order("scheduled_at").limit(1);
    if (data?.length) {
      const {id, scan_type} = data[0];
      if (scan_type === "euipo") {
        await runEuipoScan(id);
      } else if (scan_type === "handelsregister") {
        await runHandelsregisterScan(id);
      } else if (scan_type === "all") {
        await runDpmaScan(id);
        await runEuipoScan(id);
        await runHandelsregisterScan(id);
      } else {
        await runDpmaScan(id);
      }
    }
  } catch(e){console.error(`⚠️ ${(e as Error).message}`);}
}

// ── Start ───────────────────────────────────────────────────
(async()=>{
  const {error} = await db.from("scheduled_scans").select("id").limit(1);
  if(error){console.error("❌ Supabase-Fehler:",error.message);process.exit(1);}

  // Expire stale pending jobs (older than 2 hours) so they are never picked up
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const {count} = await db.from("scheduled_scans")
    .update({status:"expired"})
    .eq("status","pending")
    .lt("scheduled_at", twoHoursAgo)
    .select("id", {count:"exact", head:true});
  if (count && count > 0) console.log(`⚠️  ${count} veraltete Aufträge als expired markiert.`);

  console.log("✅ Supabase verbunden. Warte auf Aufträge…\n");
  await poll();
  setInterval(poll, POLL_INTERVAL);
})();
