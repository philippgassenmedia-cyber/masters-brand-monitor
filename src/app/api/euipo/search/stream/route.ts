import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { runEuipoSearchStream } from "@/lib/euipo/register-search-stream";

export const runtime = "nodejs";
export const maxDuration = 600;

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

  const klassen = typeof body.klassen === "string" ? body.klassen : "36 37 42";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };
      controller.enqueue(encoder.encode(": " + " ".repeat(2048) + "\n\n"));
      write({ type: "status", message: "Initialisiere EUIPO-Suche…" });

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`)); } catch {}
      }, 2000);

      try {
        for await (const evt of runEuipoSearchStream(stems, { klassen })) {
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
