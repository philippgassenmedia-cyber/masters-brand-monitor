import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { generateCSV, generatePDF } from "@/lib/export/generators";

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const exportId = url.searchParams.get("exportId");
  const format = url.searchParams.get("format") ?? "csv";

  if (!exportId) return NextResponse.json({ error: "exportId fehlt" }, { status: 400 });

  const admin = getSupabaseAdminClient();

  // Export-Metadaten laden (für Datum)
  const { data: exportRow } = await admin
    .from("lawyer_exports")
    .select("exported_at")
    .eq("id", exportId)
    .single();

  if (!exportRow) return NextResponse.json({ error: "Export nicht gefunden" }, { status: 404 });

  // Items dieses Exports laden
  const { data: items } = await admin
    .from("export_items")
    .select("item_type, item_id")
    .eq("export_id", exportId);

  const hitIds = (items ?? []).filter((i) => i.item_type === "hit").map((i) => i.item_id);
  const tmIds = (items ?? []).filter((i) => i.item_type === "trademark").map((i) => i.item_id);

  // Originaldaten laden
  const [hitsRes, tmsRes] = await Promise.all([
    hitIds.length > 0
      ? admin.from("hits").select("*").in("id", hitIds)
      : { data: [] },
    tmIds.length > 0
      ? admin.from("trademarks").select("*").in("id", tmIds)
      : { data: [] },
  ]);

  const hits = (hitsRes.data ?? []) as Array<Record<string, unknown>>;
  const trademarks = (tmsRes.data ?? []) as Array<Record<string, unknown>>;

  // Datum des originalen Exports verwenden
  const date = new Date(exportRow.exported_at).toISOString().slice(0, 10);

  return format === "pdf"
    ? generatePDF(hits, trademarks, date)
    : generateCSV(hits, trademarks, date);
}
