import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { runDpmaClassify } from "@/lib/dpma/register-search-stream";
import type { DpmaKurierHit } from "@/lib/dpma/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const hits = (body.hits ?? []) as DpmaKurierHit[];

  const admin = getSupabaseAdminClient();
  const { data: stemsData } = await admin.from("brand_stems").select("stamm").eq("aktiv", true);
  const stems = (stemsData ?? []).map((s) => s.stamm as string);
  if (!stems.length) stems.push("master");

  const encoder = new TextEncoder();

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
        for await (const evt of runDpmaClassify(hits, stems)) {
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
