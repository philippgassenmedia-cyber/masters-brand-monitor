import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { runDpmaSearchStream } from "@/lib/dpma/register-search-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

const IS_VERCEL = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

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

  const encoder = new TextEncoder();

  // ── Lokal: Chrome direkt starten, kein Job-Queue nötig ──────────────────
  if (!IS_VERCEL) {
    const stream = new ReadableStream({
      async start(controller) {
        const write = (obj: unknown) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
        };
        controller.enqueue(encoder.encode(": " + " ".repeat(2048) + "\n\n"));

        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`)); } catch {}
        }, 2000);

        try {
          for await (const evt of runDpmaSearchStream(stems, options)) {
            write(evt);
          }
        } catch (e) {
          write({ type: "error", message: (e as Error).message });
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

  // ── Vercel: Job anlegen, lokaler Agent führt Scan durch ──────────────────
  const { data: job, error: jobErr } = await admin
    .from("dpma_scan_jobs")
    .insert({ stems, options, created_by: auth.user.email })
    .select("id, created_at")
    .single();

  if (jobErr || !job) {
    return new Response(JSON.stringify({ error: `Job konnte nicht erstellt werden: ${jobErr?.message}` }), { status: 500 });
  }

  const jobId = job.id as string;

  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      controller.enqueue(encoder.encode(": " + " ".repeat(2048) + "\n\n"));
      write({ type: "status", message: `Job erstellt. Warte auf lokalen Agent (npm run dpma-agent)…` });

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`)); } catch {}
      }, 2000);

      try {
        let lastEventId = 0;
        const deadline = Date.now() + 270_000;

        while (Date.now() < deadline) {
          if (req.signal.aborted) {
            await admin.from("dpma_scan_jobs").update({ status: "cancelled" }).eq("id", jobId);
            write({ type: "status", message: "Abgebrochen." });
            break;
          }

          await new Promise((r) => setTimeout(r, 1500));

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

          const { data: jobRow } = await admin
            .from("dpma_scan_jobs")
            .select("status")
            .eq("id", jobId)
            .single();

          if (jobRow?.status === "done" || jobRow?.status === "failed") {
            const { data: tail } = await admin
              .from("dpma_scan_events")
              .select("id, event")
              .eq("job_id", jobId)
              .gt("id", lastEventId)
              .order("id");
            for (const row of tail ?? []) write(row.event);
            break;
          }

          if (lastEventId === 0 && Date.now() - new Date(job.created_at as string).getTime() > 60_000) {
            write({ type: "error", message: "Kein Agent aktiv. Starte `npm run dpma-agent` auf deinem Rechner und versuche es erneut." });
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
