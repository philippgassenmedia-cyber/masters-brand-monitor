/**
 * DPMA Scan Agent — läuft lokal auf deinem Mac im Hintergrund.
 * Wartet auf Scan-Aufträge aus der Web-UI (scheduled_scans Tabelle)
 * und führt sie mit lokalem Chrome aus (umgeht F5 Bot-Protection).
 *
 * Starten:
 *   npm run scan:agent
 *
 * Stoppen: Ctrl+C
 *
 * Ablauf:
 *   1. Web-UI erstellt Scan in scheduled_scans (type: dpma/all, status: pending)
 *   2. Agent prüft alle 30s ob ein Auftrag da ist
 *   3. Agent startet Chrome lokal → scrapet DPMA Register
 *   4. Ergebnisse landen in Supabase → sichtbar in Web-UI
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const POLL_INTERVAL = 30_000;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY fehlen"); process.exit(1); }
if (!GEMINI_KEY) { console.error("❌ GEMINI_API_KEY fehlt"); process.exit(1); }

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`\n🤖 DPMA Scan Agent gestartet`);
console.log(`   Prüfe alle ${POLL_INTERVAL / 1000}s auf neue Aufträge…`);
console.log(`   Stoppen: Ctrl+C\n`);

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

async function classify(name: string, az: string, inhaber: string|null, klassen: number[], match: {type:string}) {
  const IMMO = new Set([35,36,37,42,43]); const hasImmo = klassen.some(k=>IMMO.has(k));
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({systemInstruction:{parts:[{text:`Bewerte DPMA-Marke auf Relevanz für "MASTER" (Immobilien). JSON: {"score":<0-10>,"branchenbezug":"...","prioritaet":"<low|medium|high|critical>","begruendung":"..."}`}]},
        contents:[{role:"user",parts:[{text:`Marke:${name} AZ:${az} ${inhaber?`Inhaber:${inhaber}`:""} Klassen:${klassen.join(",")}`}]}],
        generationConfig:{responseMimeType:"application/json",temperature:0.2}})});
    if(!r.ok) throw new Error(`${r.status}`);
    const p = JSON.parse((await r.json()).candidates?.[0]?.content?.parts?.[0]?.text??"{}");
    let sc=p.score??5,pr=p.prioritaet??"medium";
    if(match.type==="exact"){sc=Math.max(sc,hasImmo?9:8);pr=hasImmo?"critical":"high";}
    else if(match.type==="compound"){sc=Math.max(sc,hasImmo?8:6);if(hasImmo)pr="high";}
    return {score:sc,branchenbezug:p.branchenbezug??"",prioritaet:pr,begruendung:p.begruendung??""};
  } catch { return {score:match.type==="exact"?8:5,branchenbezug:hasImmo?"Immobilien":"?",prioritaet:"medium",begruendung:"Auto"}; }
}

// ── DPMA Scan ───────────────────────────────────────────────
async function runDpmaScan(scanId: string) {
  console.log(`\n🔍 Scan ${scanId.slice(0,8)}… gestartet`);
  await db.from("scheduled_scans").update({status:"running",started_at:new Date().toISOString()}).eq("id",scanId);

  const {data:sd} = await db.from("brand_stems").select("stamm").eq("aktiv",true);
  const stems = (sd??[]).map(s=>s.stamm as string); if(!stems.length) stems.push("master");

  const browser = await chromium.launch({headless:true,channel:"chrome",args:["--headless=new","--disable-blink-features=AutomationControlled","--no-sandbox"]});
  const seenAz = new Set<string>();
  const hits: Array<{az:string;name:string;st:string|null}> = [];
  let errors = 0;

  for (const stem of stems) {
    const vars = getVariants(stem,6);
    for (let vi=0;vi<vars.length;vi++) {
      if(vi>0){console.log(`   ⏳ 15s…`);await new Promise(r=>setTimeout(r,15000));}
      const ctx = await browser.newContext({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"});
      const page = await ctx.newPage();
      await page.addInitScript(()=>{Object.defineProperty(navigator,"webdriver",{get:()=>false});(window as unknown as Record<string,unknown>).chrome={runtime:{}};});
      try {
        console.log(`   🔎 "${vars[vi]}"…`);
        await page.goto("https://register.dpma.de/DPMAregister/marke/basis",{timeout:45000});
        await page.waitForTimeout(5000);
        if(!(await page.$('input[name="marke"]'))){console.log(`      ⚠️ Kein Formular`);continue;}
        await page.fill('input[name="marke"]',vars[vi]);
        await page.fill('input[name="klassen"]',"36 37 42");
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
            seenAz.add(az);hits.push({az,name:t[4]??"",st:t[5]??null});c++;
          }
          const nx=await page.$('a:has-text(">>"), a:has-text("nächste")');if(!nx)break;
          try{await nx.click();await page.waitForLoadState("networkidle",{timeout:20000});await page.waitForTimeout(2000);}catch{break;}
        }
        console.log(`      ✅ ${c} Treffer`);
      } catch(e){errors++;console.log(`      ❌ ${(e as Error).message.slice(0,80)}`);}
      await page.close(); await ctx.close();
    }
  }

  // Details + Analyse
  console.log(`   📊 ${hits.length} Treffer → Details + Bewertung…`);
  const dCtx = await browser.newContext({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"});
  const dPage = await dCtx.newPage();
  await dPage.addInitScript(()=>{Object.defineProperty(navigator,"webdriver",{get:()=>false});});
  let newC=0,updC=0;

  for(let i=0;i<hits.length;i++){
    const h=hits[i];let inh:string|null=null;let kl:number[]=[];
    try{await dPage.goto(`https://register.dpma.de/DPMAregister/marke/register/${h.az}/DE`,{timeout:20000});await dPage.waitForTimeout(2500);const d=parseDetail(await dPage.textContent("body")??"");inh=d.inhaber;kl=d.klassen;}catch{}
    const m=matchType(h.name||h.az,stems);
    try{
      const{data:ex}=await db.from("trademarks").select("id").eq("aktenzeichen",h.az).eq("markenstamm",m.stem).maybeSingle();
      if(ex){await db.from("trademarks").update({last_seen_at:new Date().toISOString()}).eq("id",ex.id);updC++;continue;}
      await new Promise(r=>setTimeout(r,2000));
      const cl=await classify(h.name||h.az,h.az,inh,kl,m);
      await db.from("trademarks").insert({aktenzeichen:h.az,markenname:h.name||`[${h.az}]`,anmelder:inh,status:h.st,nizza_klassen:kl,quelle:"dpma_register",match_type:m.type,markenstamm:m.stem,register_url:`https://register.dpma.de/DPMAregister/marke/register/${h.az}/DE`,relevance_score:cl.score,branchenbezug:cl.branchenbezug,prioritaet:cl.prioritaet,begruendung:cl.begruendung});
      newC++;console.log(`   [${i+1}] ${h.name} → ${cl.score} (${cl.prioritaet})`);
    }catch(e){if(!(e as Error).message.includes("duplicate"))errors++;}
  }
  await browser.close();
  await db.from("scheduled_scans").update({status:errors>0?"partial":"completed",completed_at:new Date().toISOString(),result:{found:hits.length,new:newC,updated:updC,errors}}).eq("id",scanId);
  console.log(`   ✅ ${newC} neu, ${updC} aktualisiert, ${errors} Fehler\n`);
}

// ── Poll Loop ───────────────────────────────────────────────
async function poll() {
  try {
    const {data} = await db.from("scheduled_scans").select("id,scan_type")
      .eq("status","pending").in("scan_type",["dpma","all"])
      .lte("scheduled_at",new Date().toISOString())
      .order("scheduled_at").limit(1);
    if(data?.length){await runDpmaScan(data[0].id);}
  } catch(e){console.error(`⚠️ ${(e as Error).message}`);}
}

// ── Start ───────────────────────────────────────────────────
(async()=>{
  // Test-Verbindung
  const {error} = await db.from("scheduled_scans").select("id").limit(1);
  if(error){console.error("❌ Supabase-Fehler:",error.message);process.exit(1);}
  console.log("✅ Supabase verbunden. Warte auf Aufträge…\n");
  await poll();
  setInterval(poll, POLL_INTERVAL);
})();
