/**
 * Lokaler DPMA-Agent — läuft auf deinem Rechner mit echtem Chrome.
 * Startet mit: npm run dpma-agent
 *
 * Funktionsweise:
 *   1. Holt offene Jobs aus Supabase (dpma_scan_jobs)
 *   2. Führt den Scan mit lokalem Chrome durch
 *   3. Schreibt Events in dpma_scan_events
 *   4. Vercel-UI liest die Events und zeigt sie live an
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { runDpmaSearchStream, type DpmaSearchOptions } from "../src/lib/dpma/register-search-stream";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function processJob(jobId: string, stems: string[], options: DpmaSearchOptions) {
  console.log(`[Agent] Job ${jobId.slice(0, 8)} gestartet — Stämme: ${stems.join(", ")}`);

  const insertEvent = async (event: unknown) => {
    await db.from("dpma_scan_events").insert({ job_id: jobId, event });
  };

  try {
    for await (const event of runDpmaSearchStream(stems, options)) {
      await insertEvent(event);

      // Kurzlog in der Konsole
      if ("message" in (event as object)) {
        console.log(`  ${(event as { message: string }).message}`);
      } else if ((event as { type: string }).type === "hit:new") {
        const e = event as { aktenzeichen: string; markenname: string };
        console.log(`  ✓ NEU: ${e.markenname} (${e.aktenzeichen})`);
      } else if ((event as { type: string }).type === "done") {
        const e = event as { totalFound: number; newTrademarks: number };
        console.log(`  Fertig: ${e.totalFound} gefunden, ${e.newTrademarks} neu`);
      }
    }

    await db.from("dpma_scan_jobs").update({
      status: "done",
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`[Agent] Job ${jobId.slice(0, 8)} abgeschlossen.`);
  } catch (e) {
    console.error(`[Agent] Job ${jobId.slice(0, 8)} fehlgeschlagen:`, e);
    await insertEvent({ type: "error", message: (e as Error).message });
    await db.from("dpma_scan_jobs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

async function main() {
  console.log("DPMA-Agent gestartet. Warte auf Jobs…");
  console.log(`Supabase: ${SUPABASE_URL}`);

  // Hängengebliebene Jobs der letzten 10 Minuten zurücksetzen
  await db.from("dpma_scan_jobs")
    .update({ status: "pending", picked_up_at: null })
    .eq("status", "running")
    .lt("picked_up_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  while (true) {
    try {
      const { data: job } = await db
        .from("dpma_scan_jobs")
        .select("id, stems, options")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (job) {
        // Als "running" markieren
        const { error } = await db
          .from("dpma_scan_jobs")
          .update({ status: "running", picked_up_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("status", "pending"); // nur wenn noch pending (race condition guard)

        if (!error) {
          await processJob(job.id, job.stems as string[], (job.options ?? {}) as DpmaSearchOptions);
        }
      }
    } catch (e) {
      console.error("[Agent] Polling-Fehler:", e);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch(console.error);
