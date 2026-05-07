import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { cleanCompany, cleanAddress, cleanEmail, cleanPhone, parseGeschaeftsfuehrer } from "@/lib/profile-cleanup";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const CATEGORY_DE: Record<string, string> = {
  clear_violation: "Klare Verletzung",
  suspected_violation: "Verdacht auf Verletzung",
  borderline: "Grenzwertig",
  generic_use: "Generische Nutzung",
  own_brand: "Eigene Marke",
  other_industry: "Andere Branche",
  not_relevant: "Nicht relevant",
};

const STATUS_DE: Record<string, string> = {
  new: "Neu",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

function wrap(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();

  const [{ data: hit }, { data: notes }] = await Promise.all([
    db.from("hits").select("*").eq("id", id).single(),
    db.from("hit_notes")
      .select("text, created_by, created_at")
      .eq("hit_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!hit) return NextResponse.json({ error: "not found" }, { status: 404 });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;
  const CW = W - M * 2;
  const date = new Date().toLocaleDateString("de-DE");

  const score = hit.ai_score as number | null;
  const company =
    cleanCompany(hit.company_name as string) ??
    (hit.domain as string | null) ??
    (hit.title as string | null) ??
    "Unbekannt";

  // ── Header bar ──────────────────────────────────────────────────────────────
  const scoreColor: [number, number, number] =
    score !== null && score >= 9
      ? [220, 38, 38]
      : score !== null && score >= 7
      ? [239, 68, 68]
      : score !== null && score >= 4
      ? [217, 119, 6]
      : [120, 113, 108];

  doc.setFillColor(...scoreColor);
  doc.roundedRect(M, 14, CW, 14, 2, 2, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const scoreStr = score !== null ? `Score ${score}/10` : "Score —";
  doc.text(`${scoreStr}  ·  ${company}`, M + 4, 23);
  doc.setTextColor(0, 0, 0);

  // ── Subtitle ────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 113, 108);
  doc.text(`Auszug erstellt am ${date}`, M, 35);
  if (hit.url) {
    doc.setTextColor(180, 90, 20);
    doc.text(String(hit.url).slice(0, 90), M, 40);
    doc.setTextColor(0, 0, 0);
  }

  let y = 48;

  // ── Verletzer-Profil ────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 73, 68);
  doc.text("VERLETZER-PROFIL", M, y);
  y += 5;

  const gf = parseGeschaeftsfuehrer(hit.impressum_raw as string | null);
  const address = cleanAddress(hit.address as string);
  const email = cleanEmail(hit.email as string);
  const phone = cleanPhone(hit.phone as string);

  const profileFields: Array<[string, string | null]> = [
    ["Firma", company],
    ["Geschäftsführer", gf],
    ["Anschrift", address],
    ["E-Mail", email],
    ["Telefon", phone],
    ["Domain", hit.domain as string | null],
    ["Status", STATUS_DE[hit.status as string] ?? (hit.status as string)],
    ["Kategorie", CATEGORY_DE[hit.violation_category as string] ?? (hit.violation_category as string | null)],
  ];

  for (const [label, val] of profileFields) {
    if (!val) continue;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(80, 73, 68);
    doc.text(`${label}:`, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    const valLines = wrap(doc, val, CW - 30);
    doc.text(valLines, M + 30, y);
    y += Math.max(5, valLines.length * 4.5);
  }

  y += 3;
  doc.setDrawColor(220, 220, 218);
  doc.line(M, y, M + CW, y);
  y += 6;

  // ── KI-Analyse ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(80, 73, 68);
  doc.text("KI-ANALYSE", M, y);
  y += 5;

  const reasoning = String(hit.ai_reasoning ?? "—");
  const recommendation = String(hit.ai_recommendation ?? "—");

  const reasonLines = wrap(doc, reasoning, CW);
  const recLines = wrap(doc, recommendation, CW);

  if (y + reasonLines.length * 4.5 + recLines.length * 4.5 + 20 > 270) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(80, 73, 68);
  doc.text("Begründung:", M, y);
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(reasonLines, M, y);
  y += reasonLines.length * 4.5 + 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(80, 73, 68);
  doc.text("Empfehlung:", M, y);
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(recLines, M, y);
  y += recLines.length * 4.5 + 6;

  // ── Notes / Logs ────────────────────────────────────────────────────────────
  if (notes && notes.length > 0) {
    if (y + 30 > 270) { doc.addPage(); y = 20; }

    doc.setDrawColor(220, 220, 218);
    doc.line(M, y, M + CW, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(80, 73, 68);
    doc.text("NOTIZEN / VERLAUF", M, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Datum", "Erstellt von", "Notiz"]],
      body: notes.map((n) => [
        new Date(n.created_at as string).toLocaleDateString("de-DE") +
          " " +
          new Date(n.created_at as string).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        (n.created_by as string | null) ?? "—",
        String(n.text ?? ""),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [68, 64, 60], fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 38 },
        2: { cellWidth: "auto" },
      },
      margin: { left: M, right: M },
    });
  }

  // ── Footer on all pages ──────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 155, 152);
    doc.text(`Seite ${i} von ${pageCount}  ·  Vertraulich`, M, 290);
    doc.text(`ID: ${id}`, W - M, 290, { align: "right" });
  }

  const buffer = doc.output("arraybuffer");
  const slug = company.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="treffer-${slug}-${date.replace(/\./g, "-")}.pdf"`,
    },
  });
}
