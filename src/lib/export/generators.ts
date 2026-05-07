import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cleanCompany, cleanAddress, cleanEmail, cleanPhone, parseGeschaeftsfuehrer } from "@/lib/profile-cleanup";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}

function wrap(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

export function generateCSV(
  hits: Array<Record<string, unknown>>,
  trademarks: Array<Record<string, unknown>>,
  date: string,
): Response {
  const lines: string[] = [];

  lines.push("Quelle;Score;Firma/Marke;Adresse;E-Mail;Telefon;Domain/AZ;Begründung;Empfehlung;Status;Gefunden am");

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

  const csv = "﻿" + lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anwalt-export-${date}.csv"`,
    },
  });
}

export function generatePDF(
  hits: Array<Record<string, unknown>>,
  trademarks: Array<Record<string, unknown>>,
  date: string,
): Response {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;

  const criticalHits = hits.filter((h) => (h.ai_score as number ?? 0) >= 7);
  const mediumHits = hits.filter((h) => {
    const s = h.ai_score as number ?? 0;
    return s >= 4 && s < 7;
  });

  // Deckblatt
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Markenrechts-Report", MARGIN, 30);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 113, 108);
  doc.text(`Exportiert am ${date}`, MARGIN, 39);
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(10);
  const summary = [
    `Kritische / Hohe Treffer (Score ≥ 7):  ${criticalHits.length}`,
    `Mittlere Treffer (Score 4–6):           ${mediumHits.length}`,
    `DPMA-Register-Treffer:                  ${trademarks.length}`,
  ];
  summary.forEach((line, i) => doc.text(line, MARGIN, 52 + i * 6));

  // Teil 1: Kritische & Hohe Web-Treffer
  if (criticalHits.length > 0) {
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Teil 1 — Kritische Treffer (Score ≥ 7)`, MARGIN, 20);
    doc.setFont("helvetica", "normal");

    let y = 30;

    for (const h of criticalHits) {
      const score = h.ai_score as number;
      const company = cleanCompany(h.company_name as string) ?? String(h.domain ?? "");
      const gf = parseGeschaeftsfuehrer(h.impressum_raw as string | null);
      const address = cleanAddress(h.address as string);
      const email = cleanEmail(h.email as string);
      const phone = cleanPhone(h.phone as string);
      const reasoning = String(h.ai_reasoning ?? "—");
      const recommendation = String(h.ai_recommendation ?? "—");

      const reasonLines = wrap(doc, reasoning, CONTENT_W - 4);
      const recLines = wrap(doc, recommendation, CONTENT_W - 4);
      const cardH = 14 + 6 + 5 * 5.5 + 5 + reasonLines.length * 4.5 + 5 + recLines.length * 4.5 + 8;

      if (y + cardH > 275) { doc.addPage(); y = 20; }

      const scoreColor: [number, number, number] = score >= 9 ? [220, 38, 38] : [239, 68, 68];
      doc.setFillColor(...scoreColor);
      doc.roundedRect(MARGIN, y, CONTENT_W, 10, 2, 2, "F");

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`Score ${score}/10  ·  ${score >= 9 ? "CRITICAL" : "HOCH"}  ·  ${company}`, MARGIN + 3, y + 6.8);
      doc.setTextColor(0, 0, 0);

      y += 12;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("VERLETZER-PROFIL", MARGIN, y + 4);
      doc.setFont("helvetica", "normal");
      y += 7;

      const fields: Array<[string, string | null]> = [
        ["Firma", company],
        ["Geschäftsführer", gf],
        ["Anschrift", address],
        ["E-Mail", email],
        ["Telefon", phone],
        ["Domain / URL", String(h.url ?? "")],
      ];

      for (const [label, val] of fields) {
        if (!val) continue;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.text(`${label}:`, MARGIN, y);
        doc.setFont("helvetica", "normal");
        const valLines = wrap(doc, val, CONTENT_W - 28);
        doc.text(valLines, MARGIN + 28, y);
        y += Math.max(5, valLines.length * 4.5);
      }

      y += 3;
      doc.setDrawColor(200, 200, 200);
      doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
      y += 4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("KI-Begründung:", MARGIN, y);
      y += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(reasonLines, MARGIN, y);
      y += reasonLines.length * 4.5 + 4;

      doc.setFont("helvetica", "bold");
      doc.text("Empfehlung:", MARGIN, y);
      y += 4.5;
      doc.setFont("helvetica", "normal");
      doc.text(recLines, MARGIN, y);
      y += recLines.length * 4.5 + 10;
    }
  }

  // Teil 2: Mittlere Treffer
  if (mediumHits.length > 0) {
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Teil 2 — Mittlere Treffer (Score 4–6)", MARGIN, 20);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      startY: 26,
      head: [["Score", "Firma", "GF / Inhaber", "Adresse", "E-Mail", "Begründung (Kurzfassung)"]],
      body: mediumHits.map((h) => [
        String(h.ai_score ?? "—"),
        String(cleanCompany(h.company_name as string) ?? h.domain ?? ""),
        String(parseGeschaeftsfuehrer(h.impressum_raw as string | null) ?? "—"),
        String(cleanAddress(h.address as string) ?? "—"),
        String(cleanEmail(h.email as string) ?? "—"),
        String(h.ai_reasoning ?? "—").slice(0, 200),
      ]),
      styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [68, 64, 60] },
      columnStyles: {
        0: { cellWidth: 13 },
        1: { cellWidth: 32 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { cellWidth: 30 },
        5: { cellWidth: "auto" },
      },
    });
  }

  // Teil 3: DPMA
  if (trademarks.length > 0) {
    doc.addPage();
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Teil 3 — DPMA-Register-Treffer", MARGIN, 20);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      startY: 26,
      head: [["Score", "Marke", "Aktenzeichen", "Inhaber / Anmelder", "Anschrift", "Match", "Klassen", "Begründung"]],
      body: trademarks.map((t) => [
        String(t.relevance_score ?? "—"),
        String(t.markenname ?? ""),
        String(t.aktenzeichen ?? ""),
        String(t.anmelder ?? "—"),
        String(t.inhaber_anschrift ?? "—"),
        String(t.match_type ?? "—"),
        ((t.nizza_klassen as number[]) ?? []).join(", "),
        String(t.begruendung ?? "—"),
      ]),
      styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [68, 64, 60] },
      columnStyles: {
        0: { cellWidth: 13 },
        1: { cellWidth: 28 },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 35 },
        5: { cellWidth: 16 },
        6: { cellWidth: 16 },
        7: { cellWidth: "auto" },
      },
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
