#!/usr/bin/env tsx
/**
 * Lokaler DPMA-Register-Scan — läuft direkt mit System-Chrome, kein Browserless nötig.
 * Aufruf: npm run dpma-scan
 *         npm run dpma-scan -- --stems master,meister
 *         npm run dpma-scan -- --klassen "36 37" --zeitraum 6
 *         npm run dpma-scan -- --alle-laender --auch-geloescht
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { runDpmaSearchStream } from "../src/lib/dpma/register-search-stream";

// .env.local / .env manuell einlesen (kein dotenv-Paket nötig)
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

// CLI-Args
const args = process.argv.slice(2);
const getArg = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const cliStems = getArg("--stems")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const klassen = getArg("--klassen") ?? "36 37 42";
const zeitraumMonate = parseInt(getArg("--zeitraum") ?? "0", 10);
const nurDE = !args.includes("--alle-laender");
const nurInKraft = !args.includes("--auch-geloescht");

async function main() {
  // Stems aus Supabase oder CLI-Arg oder Fallback
  let stems: string[] = cliStems;
  if (!stems.length) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const db = createClient(url, key);
      const { data } = await db.from("brand_stems").select("stamm").eq("aktiv", true);
      stems = (data ?? []).map((s: { stamm: string }) => s.stamm);
    }
    if (!stems.length) stems = ["master"];
  }

  const DIM = "\x1b[2m", RESET = "\x1b[0m", BOLD = "\x1b[1m";
  const GREEN = "\x1b[32m", RED = "\x1b[31m";

  console.log(`\n${BOLD}DPMA Register-Scan${RESET}`);
  console.log(`${DIM}Stämme: ${stems.join(", ")} · Klassen: ${klassen} · Zeitraum: ${zeitraumMonate === 0 ? "alle" : `${zeitraumMonate} Monate`}${RESET}\n`);

  let dotLine = false;
  const flush = (msg: string) => { if (dotLine) { process.stdout.write("\n"); dotLine = false; } console.log(msg); };

  for await (const evt of runDpmaSearchStream(stems, { nurDE, nurInKraft, klassen, zeitraumMonate })) {
    switch (evt.type) {
      case "status":   flush(`  ${DIM}${evt.message}${RESET}`); break;
      case "error":    flush(`  ${RED}✗ ${evt.message}${RESET}`); break;
      case "analyze:start": process.stdout.write("."); dotLine = true; break;
      case "hit:new":
        flush(`  ${GREEN}${BOLD}✓ NEU${RESET}  ${evt.markenname} [${evt.aktenzeichen}]  Score: ${evt.score ?? "—"}${evt.website ? `  ${evt.website}` : ""}`);
        break;
      case "done":
        flush(`\n${BOLD}Fertig${RESET}  ${evt.totalFound} gefunden · ${GREEN}${evt.newTrademarks} neu${RESET} · ${evt.updated} aktualisiert · ${evt.errors > 0 ? `${RED}${evt.errors} Fehler${RESET}` : "0 Fehler"}\n`);
        break;
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
