import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { runScheduledScan } from "@/lib/scheduled-runner";

const CreateSchema = z.object({
  scheduled_at: z.string().min(1),
  scan_type: z.enum(["web", "dpma", "all"]).default("all"),
  notes: z.string().optional(),
});

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("scheduled_scans")
    .select("*")
    .order("scheduled_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ scans: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();

  // Sofort-Trigger
  if (body.trigger_id) {
    const admin = getSupabaseAdminClient();
    const { data: scan } = await admin
      .from("scheduled_scans")
      .select("id, scan_type")
      .eq("id", body.trigger_id)
      .eq("status", "pending")
      .single();
    if (!scan) return NextResponse.json({ error: "Scan nicht gefunden oder bereits gelaufen" }, { status: 404 });
    runScheduledScan(scan.id, scan.scan_type).catch((e) => console.error("[Manual]", (e as Error).message));
    return NextResponse.json({ ok: true, message: "Scan gestartet" });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const { error } = await supabase.from("scheduled_scans").insert({
    scheduled_at: parsed.data.scheduled_at,
    scan_type: parsed.data.scan_type,
    notes: parsed.data.notes ?? null,
    created_by: auth.user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = (await req.json()) as { id: string };
  await supabase.from("scheduled_scans").delete().eq("id", id).eq("status", "pending");
  return NextResponse.json({ ok: true });
}
