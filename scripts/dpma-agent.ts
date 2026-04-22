/**
 * Lokaler DPMA-Agent — läuft auf deinem Rechner mit echtem Chrome.
 *
 * Starten:
 *   npm run dpma-agent
 *
 * Voraussetzung (einmalig in Supabase SQL-Editor ausführen):
 *   supabase/migrations/0016_dpma_scan_jobs.sql
 *
 * Ablauf:
 *   1. Dieser Prozess läuft auf deinem Rechner
 *   2. Vercel-UI erstellt einen Job in Supabase
 *   3. Agent nimmt Job auf, startet Chrome lokal, scrapt DPMA
 *   4. Events werden in Supabase geschrieben
 *   5. Vercel-UI zeigt die Events live an
 */
import { createClient } from "@supabase/supabase-js";
import { runDpmaSearchStream, type DpmaSearchOptions } from "../src/lib/dpma/register-search-stream";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Startup-Check ─────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════");
console.log("  DPMA Lokaler Agent");
console.log("═══════════════════════════════════════════");

if (!SUPABASE_URL) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL fehlt in .env.local");
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error("✗ SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local");
  process.exit(1);
}

console.log(`✓ Supabase: ${SUPABASE_URL}`);
console.log(`✓ Service Key: ${SUPABASE_KEY.slice(0, 20)}…`);
console.log("───────────────────────────────────────────\n");

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Verbindung testen ─────────────────────────────────────────────────────
async function testConnection() {
  const { error } = await db.from("dpma_scan_jobs").select("id").limit(1);
  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      console.error("✗ Tabelle 'dpma_scan_jobs' existiert nicht in Supabase.");
      console.error("  → Bitte supabase/migrations/0016_dpma_scan_jobs.sql im Supabase SQL-Editor ausführen.");
    } else {
      console.error("✗ Supabase-Verbindungsfehler:", error.message);
    }
    process.exit(1);
  }
  console.log("✓ Supabase verbunden · Tabellen vorhanden");
  console.log("  Warte auf Jobs von der Vercel-UI…\n");
}

// ── Job verarbeiten ───────────────────────────────────────────────────────
async function processJob(jobId: string, stems: string[], options: DpmaSearchOptions) {
  console.log(`\n[Job ${jobId.slice(0, 8)}] Gestartet — Stämme: ${stems.join(", ")}`);
  console.log(`[Job ${jobId.slice(0, 8)}] Optionen: ${JSON.stringify(options)}\n`);

  const insertEvent = async (event: unknown) => {
    const { error } = await db.from("dpma_scan_events").insert({ job_id: jobId, event });
    if (error) console.error("  Event-Fehler:", error.message);
  };

  try {
    for await (const event of runDpmaSearchStream(stems, options)) {
      await insertEvent(event);

      const e = event as Record<string, unknown>;
      if (e.type === "status")   console.log(`  ${e.message}`);
      if (e.type === "error")    console.error(`  ✗ ${e.message}`);
      if (e.type === "hit:new")  console.log(`  ✓ NEU: ${e.markenname} (${e.aktenzeichen})`);
      if (e.type === "done")     console.log(`\n  Fertig: ${e.totalFound} gefunden, ${e.newTrademarks} neu, ${e.errors} Fehler`);
    }

    await db.from("dpma_scan_jobs").update({
      status: "done",
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`\n[Job ${jobId.slice(0, 8)}] ✓ Abgeschlossen\n`);
  } catch (e) {
    console.error(`\n[Job ${jobId.slice(0, 8)}] ✗ Fehlgeschlagen:`, e);
    await insertEvent({ type: "error", message: String((e as Error).message ?? e) });
    await db.from("dpma_scan_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

// ── Haupt-Loop ────────────────────────────────────────────────────────────
async function main() {
  await testConnection();

  // Hängengebliebene Jobs zurücksetzen
  await db.from("dpma_scan_jobs")
    .update({ status: "pending", picked_up_at: null })
    .eq("status", "running")
    .lt("picked_up_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  while (true) {
    try {
      const { data: job, error } = await db
        .from("dpma_scan_jobs")
        .select("id, stems, options")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Polling-Fehler:", error.message);
      } else if (job) {
        const { error: updateError } = await db
          .from("dpma_scan_jobs")
          .update({ status: "running", picked_up_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("status", "pending");

        if (!updateError) {
          await processJob(job.id, job.stems as string[], (job.options ?? {}) as DpmaSearchOptions);
        }
      }
    } catch (e) {
      console.error("Unerwarteter Fehler:", e);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((e) => {
  console.error("Agent-Fehler:", e);
  process.exit(1);
});
