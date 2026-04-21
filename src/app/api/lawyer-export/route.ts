import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { cleanCompany, cleanAddress, cleanEmail, cleanPhone } from "@/lib/profile-cleanup";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const source = url.searchParams.get("source") ?? "all"; // "hits", "trademarks", "all"
  const minScore = Number(url.searchParams.get("minScore") ?? 5);

  const admin = getSupabaseAdminClient();

  // Web-Hits laden
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

  // Trademarks laden
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

  // Export-Items speichern
  if (exportId) {
    const items = [
      ...hits.map((h) => ({ export_id: exportId, item_type: "hit", item_id: h.id as string })),
      ...trademarks.map((t) => ({ export_id: exportId, item_type: "trademark", item_id: t.id as string })),
    ];
    if (items.length > 0) {
      await admin.from("export_items").insert(items);
    }
  }

  // Hits als Status "sent_to_lawyer" markieren
  if (hits.length > 0) {
    const hitIds = hits.map((h) => h.id as string);
    await admin.from("hits").update({ status: "sent_to_lawyer" }).in("id", hitIds);
  }
  if (trademarks.length > 0) {
    const tmIds = trademarks.map((t) => t.id as string);
    await admin.from("trademarks").update({ workflow_status: "sent_to_lawyer" }).in("id", tmIds);
  }

  const date = new Date().toISOString().slice(0, 10);

  if (format === "pdf") {
    return generatePDF(hits, trademarks, date);
  }
  return generateCSV(hits, trademarks, date);
}

function generateCSV(
  hits: Array<Record<string, unknown>>,
  trademarks: Array<Record<string, unknown>>,
  date: string,
): Response {
  const lines: string[] = [];

  // Header
  lines.push("Quelle;Score;Firma/Marke;Adresse;E-Mail;Telefon;Domain/AZ;Begründung;Empfehlung;Status;Gefunden am");

  // Web-Hits
  for (const h of hits) {
    lines.push([
      "Web",
      h.ai_score,
      cleanCompany(h.company_name as string) ?? h.domain,
      cleanAddress(h.address as string) ?? "",
      cleanEmail(h.email as string) ?? "",
      cleanPhone(h.phone as string) ?? "",
      h.domain,
      h.ai_reasoning,
      h.ai_recommendation,
      h.violation_category ?? "",
      (h.first_seen_at as string)?.slice(0, 10) ?? "",
    ].map(csvEscape).join(";"));
  }

  // Trademarks
  for (const t of trademarks) {
    lines.push([
      "DPMA",
      t.relevance_score,
      t.markenname,
      t.inhaber_anschrift ?? "",
      "",
      "",
      t.aktenzeichen,
      t.begruendung ?? "",
      `Match: ${t.match_type}, Klassen: ${(t.nizza_klassen as number[])?.join(",") ?? ""}`,
      t.prioritaet ?? "",
      (t.created_at as string)?.slice(0, 10) ?? "",
    ].map(csvEscape).join(";"));
  }

  const csv = "\uFEFF" + lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anwalt-export-${date}.csv"`,
    },
  });
}

function generatePDF(
  hits: Array<Record<string, unknown>>,
  trademarks: Array<Record<string, unknown>>,
  date: string,
): Response {
  const doc = new jsPDF({ orientation: "landscape" });

  // Titel
  doc.setFontSize(18);
  doc.text("Master Brand Monitor — Anwalts-Report", 14, 20);
  doc.setFontSize(10);
  doc.text(`Exportiert am ${date} | ${hits.length} Web-Treffer | ${trademarks.length} DPMA-Treffer`, 14, 28);

  let y = 35;

  // Web-Hits
  if (hits.length > 0) {
    doc.setFontSize(13);
    doc.text("Web-Verletzungen", 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Score", "Firma", "Domain", "Begründung", "Empfehlung"]],
      body: hits.map((h) => [
        String(h.ai_score ?? "—"),
        String(cleanCompany(h.company_name as string) ?? h.domain ?? ""),
        String(h.domain ?? ""),
        String(h.ai_reasoning ?? "").slice(0, 120),
        String(h.ai_recommendation ?? "").slice(0, 80),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [68, 64, 60] },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 40 },
        2: { cellWidth: 35 },
        3: { cellWidth: 100 },
        4: { cellWidth: 70 },
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Trademarks
  if (trademarks.length > 0) {
    if (y > 160) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text("DPMA-Register-Treffer", 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Score", "Marke", "AZ", "Inhaber", "Match", "Klassen", "Begründung"]],
      body: trademarks.map((t) => [
        String(t.relevance_score ?? "—"),
        String(t.markenname ?? ""),
        String(t.aktenzeichen ?? ""),
        String(t.anmelder ?? "").slice(0, 40),
        String(t.match_type ?? ""),
        ((t.nizza_klassen as number[]) ?? []).join(", "),
        String(t.begruendung ?? "").slice(0, 100),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [68, 64, 60] },
    });
  }

  const buffer = doc.output("arraybuffer");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="anwalt-report-${date}.pdf"`,
    },
  });
}
