import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getSupabaseAdminClient } from "./supabase/server";
import { cleanCompany, cleanAddress, cleanEmail, cleanPhone } from "./profile-cleanup";

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD not configured");

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

interface ReportHit {
  source: "web" | "dpma";
  score: number | null;
  name: string;
  domain: string;
  reasoning: string;
  recommendation: string;
  address: string;
  email: string;
  phone: string;
}

async function getNewViolations(): Promise<ReportHit[]> {
  const db = getSupabaseAdminClient();
  const results: ReportHit[] = [];

  // Web-Hits mit Score >= 5, status = new
  const { data: hits } = await db
    .from("hits")
    .select("*")
    .gte("ai_score", 5)
    .eq("status", "new")
    .order("ai_score", { ascending: false });

  for (const h of hits ?? []) {
    results.push({
      source: "web",
      score: h.ai_score,
      name: cleanCompany(h.company_name) ?? h.domain ?? "—",
      domain: h.domain ?? "",
      reasoning: h.ai_reasoning ?? "",
      recommendation: h.ai_recommendation ?? "",
      address: cleanAddress(h.address) ?? "",
      email: cleanEmail(h.email) ?? "",
      phone: cleanPhone(h.phone) ?? "",
    });
  }

  // DPMA-Treffer mit Score >= 5, workflow_status = new
  const { data: trademarks } = await db
    .from("trademarks")
    .select("*")
    .gte("relevance_score", 5)
    .eq("workflow_status", "new")
    .order("relevance_score", { ascending: false });

  for (const t of trademarks ?? []) {
    results.push({
      source: "dpma",
      score: t.relevance_score,
      name: t.markenname ?? "—",
      domain: t.aktenzeichen ?? "",
      reasoning: t.begruendung ?? "",
      recommendation: `Match: ${t.match_type}, Klassen: ${(t.nizza_klassen ?? []).join(",")}`,
      address: t.inhaber_anschrift ?? "",
      email: "",
      phone: "",
    });
  }

  return results;
}

function generateCSV(violations: ReportHit[]): string {
  const header = "Quelle;Score;Firma/Marke;Domain/AZ;Begründung;Empfehlung;Adresse;E-Mail;Telefon";
  const rows = violations.map((v) =>
    [v.source === "web" ? "Web" : "DPMA", v.score, v.name, v.domain, v.reasoning, v.recommendation, v.address, v.email, v.phone]
      .map((val) => {
        const s = String(val ?? "").replace(/"/g, '""');
        return /[",\n;]/.test(s) ? `"${s}"` : s;
      })
      .join(";"),
  );
  return "\uFEFF" + [header, ...rows].join("\n");
}

function generatePDF(violations: ReportHit[], date: string): Buffer {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(18);
  doc.text("Master Brand Monitor — Scan-Report", 14, 20);
  doc.setFontSize(10);
  doc.text(`Automatischer Deep-Scan vom ${date} | ${violations.length} potenzielle Verletzungen`, 14, 28);

  const webHits = violations.filter((v) => v.source === "web");
  const dpmaHits = violations.filter((v) => v.source === "dpma");

  let y = 35;

  if (webHits.length > 0) {
    doc.setFontSize(13);
    doc.text(`Web-Verletzungen (${webHits.length})`, 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [["Score", "Firma", "Domain", "Begründung"]],
      body: webHits.map((h) => [String(h.score ?? "—"), h.name, h.domain, h.reasoning.slice(0, 150)]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [68, 64, 60] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  if (dpmaHits.length > 0) {
    if (y > 160) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text(`DPMA-Register-Treffer (${dpmaHits.length})`, 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      head: [["Score", "Marke", "AZ", "Begründung"]],
      body: dpmaHits.map((h) => [String(h.score ?? "—"), h.name, h.domain, h.reasoning.slice(0, 150)]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [68, 64, 60] },
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export async function sendScanReport(): Promise<{ sent: number; violations: number }> {
  const db = getSupabaseAdminClient();

  // Empfänger laden
  const { data: recipients } = await db
    .from("email_recipients")
    .select("email, name")
    .eq("aktiv", true);

  if (!recipients?.length) return { sent: 0, violations: 0 };

  const violations = await getNewViolations();
  if (violations.length === 0) return { sent: 0, violations: 0 };

  const date = new Date().toLocaleDateString("de-DE");
  const csv = generateCSV(violations);
  const pdf = generatePDF(violations, date);

  const transporter = getTransporter();
  const to = recipients.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(", ");

  const webCount = violations.filter((v) => v.source === "web").length;
  const dpmaCount = violations.filter((v) => v.source === "dpma").length;

  await transporter.sendMail({
    from: `Master Brand Monitor <${process.env.GMAIL_USER}>`,
    to,
    subject: `Markenrecht-Report: ${violations.length} neue Verdachtsfälle (${date})`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
        <h2 style="color: #1c1917;">Master Brand Monitor</h2>
        <p>Der automatische Deep-Scan hat <strong>${violations.length} neue potenzielle Markenverletzungen</strong> gefunden:</p>
        <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
          <tr style="background: #f5f5f4;">
            <td style="padding: 8px; border-bottom: 1px solid #e7e5e4;"><strong>Web-Treffer</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #e7e5e4; text-align: right;">${webCount}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e7e5e4;"><strong>DPMA-Register</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #e7e5e4; text-align: right;">${dpmaCount}</td>
          </tr>
        </table>
        <h3 style="margin-top: 20px;">Top-Verdachtsfälle:</h3>
        <ul style="font-size: 13px; line-height: 1.6;">
          ${violations.slice(0, 10).map((v) => `<li><strong>${v.name}</strong> (Score ${v.score ?? "—"}, ${v.source === "web" ? "Web" : "DPMA"}) — ${v.reasoning.slice(0, 100)}…</li>`).join("")}
        </ul>
        ${violations.length > 10 ? `<p style="color: #78716c; font-size: 12px;">+ ${violations.length - 10} weitere — siehe Anhang</p>` : ""}
        <p style="margin-top: 20px; font-size: 12px; color: #78716c;">
          Die vollständige Liste finden Sie als CSV und PDF im Anhang.<br>
          <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://masters-brand-monitor-original.vercel.app"}">Dashboard öffnen →</a>
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `brand-monitor-report-${new Date().toISOString().slice(0, 10)}.csv`,
        content: csv,
        contentType: "text/csv",
      },
      {
        filename: `brand-monitor-report-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  return { sent: recipients.length, violations: violations.length };
}
