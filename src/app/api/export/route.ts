import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes(";")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const minScore = Number(url.searchParams.get("minScore") ?? 0);

  const admin = getSupabaseAdminClient();
  let query = admin
    .from("hits")
    .select(
      "ai_score, ai_violation_category, company_name, address, email, phone, domain, ai_reasoning, ai_recommendation, status, first_seen_at, last_seen_at",
    )
    .order("ai_score", { ascending: false, nullsFirst: false });

  if (minScore > 0) {
    query = query.gte("ai_score", minScore);
  }

  const { data: hits, error } = await query.limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build CSV
  const headers = [
    "Score",
    "Kategorie",
    "Firma",
    "Adresse",
    "E-Mail",
    "Telefon",
    "Domain",
    "Begründung",
    "Empfehlung",
    "Status",
    "Erstmals gesehen",
    "Zuletzt gesehen",
  ];

  const rows = (hits ?? []).map((h) =>
    [
      escapeCSV(String(h.ai_score ?? "")),
      escapeCSV(h.ai_violation_category),
      escapeCSV(h.company_name),
      escapeCSV(h.address),
      escapeCSV(h.email),
      escapeCSV(h.phone),
      escapeCSV(h.domain),
      escapeCSV(h.ai_reasoning),
      escapeCSV(h.ai_recommendation),
      escapeCSV(STATUS_LABEL[h.status] ?? h.status),
      escapeCSV(h.first_seen_at ? new Date(h.first_seen_at).toLocaleDateString("de-DE") : ""),
      escapeCSV(h.last_seen_at ? new Date(h.last_seen_at).toLocaleDateString("de-DE") : ""),
    ].join(";"),
  );

  // BOM for Excel UTF-8 recognition
  const BOM = "\uFEFF";
  const csv = BOM + headers.join(";") + "\n" + rows.join("\n");

  const filename = `master-brand-monitor-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
