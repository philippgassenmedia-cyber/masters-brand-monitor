import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { generateCSV, generatePDF } from "@/lib/export/generators";

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const source = url.searchParams.get("source") ?? "all";
  const minScore = Number(url.searchParams.get("minScore") ?? 5);

  const admin = getSupabaseAdminClient();

  let hits: Array<Record<string, unknown>> = [];
  if (source === "hits" || source === "all") {
    const { data } = await admin
      .from("hits")
      .select("*")
      .gte("ai_score", minScore)
      .not("status", "in", '("dismissed","resolved")')
      .order("ai_score", { ascending: false });
    hits = (data ?? []) as Array<Record<string, unknown>>;
  }

  let trademarks: Array<Record<string, unknown>> = [];
  if (source === "trademarks" || source === "all") {
    const { data } = await admin
      .from("trademarks")
      .select("*")
      .gte("relevance_score", minScore)
      .not("workflow_status", "in", '("dismissed","resolved")')
      .order("relevance_score", { ascending: false });
    trademarks = (data ?? []) as Array<Record<string, unknown>>;
  }

  // Export loggen
  const { data: exportLog } = await admin
    .from("lawyer_exports")
    .insert({
      format,
      hit_count: hits.length,
      trademark_count: trademarks.length,
      exported_by: auth.user.email,
    })
    .select("id")
    .single();

  const exportId = exportLog?.id;

  if (exportId) {
    const items = [
      ...hits.map((h) => ({ export_id: exportId, item_type: "hit", item_id: h.id as string })),
      ...trademarks.map((t) => ({ export_id: exportId, item_type: "trademark", item_id: t.id as string })),
    ];
    if (items.length > 0) await admin.from("export_items").insert(items);
  }

  // Status aktualisieren
  if (hits.length > 0) {
    await admin.from("hits").update({ status: "sent_to_lawyer" }).in("id", hits.map((h) => h.id as string));
  }
  if (trademarks.length > 0) {
    await admin.from("trademarks").update({ workflow_status: "sent_to_lawyer" }).in("id", trademarks.map((t) => t.id as string));
  }

  const date = new Date().toISOString().slice(0, 10);
  return format === "pdf" ? generatePDF(hits, trademarks, date) : generateCSV(hits, trademarks, date);
}
