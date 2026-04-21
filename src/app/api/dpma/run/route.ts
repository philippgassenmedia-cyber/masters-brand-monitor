import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { runDpmaPipeline } from "@/lib/dpma/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

// Manueller Trigger (authentifiziert) oder Cron (Secret)
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (secret && secret === process.env.CRON_SECRET) {
    // Cron-Trigger
  } else {
    // User-Trigger
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runDpmaPipeline();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export const GET = POST;
