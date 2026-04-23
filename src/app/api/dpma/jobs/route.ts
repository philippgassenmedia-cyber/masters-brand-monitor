import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

// Agent gilt als online wenn er innerhalb der letzten 20 Minuten einen Job aufgenommen hat
const AGENT_ONLINE_WINDOW_MS = 20 * 60 * 1000;

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();
  const { data: jobs } = await db
    .from("dpma_scan_jobs")
    .select("id, created_at, picked_up_at, finished_at, status, stems, created_by, options")
    .order("created_at", { ascending: false })
    .limit(10);

  const cutoff = new Date(Date.now() - AGENT_ONLINE_WINDOW_MS).toISOString();
  const agentOnline = (jobs ?? []).some(
    (j) => j.picked_up_at && j.picked_up_at > cutoff,
  );

  // Neueste Marken-Treffer für den letzten abgeschlossenen Job
  const lastDoneJob = (jobs ?? []).find((j) => j.status === "done" || j.status === "running");
  let recentTrademarks: unknown[] = [];
  if (lastDoneJob?.created_at) {
    const { data: tm } = await db
      .from("trademarks")
      .select("id, markenname, aktenzeichen, relevance_score, match_type, prioritaet, created_at")
      .gte("created_at", lastDoneJob.created_at)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(20);
    recentTrademarks = tm ?? [];
  }

  return NextResponse.json({ jobs: jobs ?? [], agentOnline, recentTrademarks });
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();

  const { data: stemsData } = await db
    .from("brand_stems")
    .select("stem")
    .limit(50);
  const stems = (stemsData ?? []).map((s: { stem: string }) => s.stem).filter(Boolean);

  if (!stems.length) {
    return NextResponse.json(
      { error: "Keine Markenstämme konfiguriert. Bitte unter Einstellungen → DPMA eintragen." },
      { status: 400 },
    );
  }

  // Bestehende pending Jobs abbrechen (nur einen Job gleichzeitig)
  await db
    .from("dpma_scan_jobs")
    .update({ status: "cancelled" })
    .eq("status", "pending");

  const body = await req.json().catch(() => ({}));
  const { data: job } = await db
    .from("dpma_scan_jobs")
    .insert({
      stems,
      options: body.options ?? {},
      created_by: auth.user.email ?? "mobile",
    })
    .select("id, created_at, status")
    .single();

  return NextResponse.json({ job });
}
