import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  const admin = getSupabaseAdminClient();
  const { data: stemsData } = await admin.from("brand_stems").select("stamm").eq("aktiv", true);
  const stems = (stemsData ?? []).map((s) => s.stamm as string);
  if (!stems.length) stems.push("master");

  const options = {
    nurDE:          body.nurDE !== false,
    nurInKraft:     body.nurInKraft !== false,
    klassen:        typeof body.klassen === "string" ? body.klassen : "36 37 42",
    zeitraumMonate: typeof body.zeitraumMonate === "number" ? body.zeitraumMonate : 0,
  };

  // Job in Supabase anlegen — lokaler Agent nimmt ihn auf
  const { data: job, error: jobErr } = await admin
    .from("dpma_scan_jobs")
    .insert({ stems, options, created_by: auth.user.email })
    .select("id, created_at")
    .single();

  if (jobErr || !job) {
    return new Response(JSON.stringify({ error: "Job konnte nicht erstellt werden" }), { status: 500 });
  }

  const jobId = job.id as string;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      // Flush-Puffer für SSE-Proxies
      controller.enqueue(encoder.encode(": " + " ".repeat(2048) + "\n\n"));
      write({ type: "status", message: `Job erstellt (${jobId.slice(0, 8)}…). Warte auf lokalen Agent…` });

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`)); } catch {}
      }, 2000);

      try {
        let lastEventId = 0;
        const deadline = Date.now() + 270_000; // 270s (unter Vercel-Limit)

        while (Date.now() < deadline) {
          if (req.signal.aborted) {
            // Job abbrechen
            await admin.from("dpma_scan_jobs").update({ status: "cancelled" }).eq("id", jobId);
            write({ type: "status", message: "Abgebrochen." });
            break;
          }

          await new Promise((r) => setTimeout(r, 1500));

          // Neue Events vom Agent abholen
          const { data: events } = await admin
            .from("dpma_scan_events")
            .select("id, event")
            .eq("job_id", jobId)
            .gt("id", lastEventId)
            .order("id")
            .limit(50);

          for (const row of events ?? []) {
            write(row.event);
            lastEventId = row.id as number;
          }

          // Job-Status prüfen
          const { data: jobRow } = await admin
            .from("dpma_scan_jobs")
            .select("status")
            .eq("id", jobId)
            .single();

          if (jobRow?.status === "done" || jobRow?.status === "failed") {
            // Restliche Events holen
            const { data: tail } = await admin
              .from("dpma_scan_events")
              .select("id, event")
              .eq("job_id", jobId)
              .gt("id", lastEventId)
              .order("id");
            for (const row of tail ?? []) write(row.event);
            break;
          }

          // Noch kein Agent — nach 60s Warnung schicken
          if (lastEventId === 0 && Date.now() - (new Date(job.created_at ?? Date.now()).getTime()) > 60_000) {
            write({ type: "error", message: "Kein lokaler Agent gefunden. Starte `npm run dpma-agent` auf deinem Rechner." });
            break;
          }
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
