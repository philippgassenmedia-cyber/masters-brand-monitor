import { redirect } from "next/navigation";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-stone-500";
  if (score >= 7) return "text-rose-700 font-bold";
  if (score >= 4) return "text-amber-700 font-semibold";
  return "text-stone-600";
}

export default async function HistoryPrintPage() {
  // Auth
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const admin = getSupabaseAdminClient();

  // Fetch hits
  const { data: hitsRaw } = await admin
    .from("hits")
    .select(
      "id, url, domain, company_name, address, ai_score, violation_category, status, ai_reasoning, ai_recommendation, first_seen_at, last_seen_at, notes, ai_model",
    )
    .order("ai_score", { ascending: false, nullsFirst: false });

  // Fetch hit_notes
  const { data: hitNotesRaw } = await admin
    .from("hit_notes")
    .select("hit_id, text")
    .order("created_at", { ascending: true });

  const notesByHit = new Map<string, string[]>();
  for (const n of hitNotesRaw ?? []) {
    const arr = notesByHit.get(n.hit_id) ?? [];
    arr.push(n.text);
    notesByHit.set(n.hit_id, arr);
  }

  // Fetch trademarks
  const { data: trademarksRaw } = await admin
    .from("trademarks")
    .select(
      "id, markenname, aktenzeichen, relevance_score, workflow_status, quelle, nizza_klassen, branchenbezug, begruendung, anmelder, created_at",
    )
    .order("relevance_score", { ascending: false, nullsFirst: false });

  const hits = hitsRaw ?? [];
  const trademarks = trademarksRaw ?? [];

  const dateStr = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <html lang="de">
      <head>
        <title>Marken-Monitor Export — {dateStr}</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Inter, system-ui, sans-serif; font-size: 13px; color: #1c1917; background: #fff; }
          h1 { font-size: 22px; font-weight: 700; }
          h2 { font-size: 16px; font-weight: 600; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #292524; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
          td { padding: 5px 8px; border-bottom: 1px solid #e7e5e4; vertical-align: top; }
          tr:nth-child(even) td { background: #fafaf9; }
          .badge { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; }
          .badge-web { background: #dbeafe; color: #1e40af; }
          .badge-dpma { background: #ede9fe; color: #5b21b6; }
          .badge-euipo { background: #fce7f3; color: #831843; }
          .section { margin: 28px 0 0 0; }
          .print-btn { display: inline-block; margin: 16px 0 28px 0; padding: 8px 22px; background: #1c1917; color: #fff; border: none; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
          .stats { display: flex; gap: 20px; margin: 12px 0 24px 0; }
          .stat { background: #f5f5f4; border-radius: 12px; padding: 12px 20px; }
          .stat-num { font-size: 24px; font-weight: 700; }
          .stat-label { font-size: 11px; color: #78716c; margin-top: 2px; }
          .score-high { color: #be123c; font-weight: 700; }
          .score-med { color: #92400e; font-weight: 600; }
          .score-low { color: #57534e; }
          .notes { color: #6b7280; font-style: italic; }
          @media print {
            .print-btn { display: none !important; }
            body { font-size: 11px; }
            th { font-size: 9px; }
            td { font-size: 10px; padding: 4px 6px; }
            .section { margin-top: 20px; }
            h2 { page-break-after: avoid; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
          }
        `}</style>
      </head>
      <body style={{ padding: "24px 32px" }}>
        {/* Header */}
        <header style={{ borderBottom: "2px solid #1c1917", paddingBottom: "16px", marginBottom: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1>Marken-Monitor Export</h1>
              <p style={{ color: "#78716c", marginTop: "4px" }}>Erstellt am {dateStr}</p>
            </div>
            <div style={{ textAlign: "right", color: "#78716c", fontSize: "11px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "#1c1917" }}>MASTER Brand Monitor</div>
              <div>Gesamtexport — Vertraulich</div>
            </div>
          </div>
        </header>

        {/* Print button — hidden in print */}
        <PrintButton />

        {/* Summary stats */}
        <div className="stats">
          <div className="stat">
            <div className="stat-num">{hits.length}</div>
            <div className="stat-label">Web-Treffer gesamt</div>
          </div>
          <div className="stat">
            <div className="stat-num">{hits.filter((h) => (h.ai_score as number | null) != null && (h.ai_score as number) >= 7).length}</div>
            <div className="stat-label">Kritisch (Score ≥ 7)</div>
          </div>
          <div className="stat">
            <div className="stat-num">{trademarks.length}</div>
            <div className="stat-label">Register-Einträge</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              {hits.filter((h) => (h.ai_score as number | null) != null && (h.ai_score as number) >= 4 && (h.ai_score as number) < 7).length}
            </div>
            <div className="stat-label">Mittel (Score 4–6)</div>
          </div>
        </div>

        {/* ── Hits table ── */}
        <section className="section">
          <h2>Web-Treffer ({hits.length})</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>Score</th>
                <th style={{ width: 50 }}>Typ</th>
                <th style={{ width: 140 }}>Firma / Domain</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 100 }}>Kategorie</th>
                <th>Begründung</th>
                <th style={{ width: 130 }}>Notizen</th>
                <th style={{ width: 75 }}>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {hits.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "20px", color: "#78716c" }}>
                    Keine Web-Treffer vorhanden.
                  </td>
                </tr>
              )}
              {hits.map((h) => {
                const score = h.ai_score as number | null;
                const notesArr = [
                  ...(h.notes ? [h.notes as string] : []),
                  ...(notesByHit.get(h.id) ?? []),
                ];
                const notesText = notesArr.join(" | ");
                return (
                  <tr key={h.id}>
                    <td>
                      <span
                        className={
                          score != null && score >= 7
                            ? "score-high"
                            : score != null && score >= 4
                            ? "score-med"
                            : "score-low"
                        }
                      >
                        {score ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-web">Web</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {(h.company_name as string | null) ?? (h.domain as string | null) ?? "—"}
                      </div>
                      {h.url && (
                        <div style={{ color: "#78716c", fontSize: "10px", wordBreak: "break-all" }}>
                          {h.url as string}
                        </div>
                      )}
                    </td>
                    <td>{(h.status as string | null) ?? "—"}</td>
                    <td>{(h.violation_category as string | null) ?? "—"}</td>
                    <td style={{ maxWidth: 220 }}>{(h.ai_reasoning as string | null) ?? "—"}</td>
                    <td className="notes" style={{ maxWidth: 130 }}>{notesText || "—"}</td>
                    <td>{fmtDate(h.first_seen_at as string | null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ── Trademarks table ── */}
        <section className="section" style={{ marginTop: 36 }}>
          <h2>Register-Einträge DPMA / EUIPO ({trademarks.length})</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>Score</th>
                <th style={{ width: 60 }}>Quelle</th>
                <th style={{ width: 150 }}>Markenname</th>
                <th style={{ width: 110 }}>Aktenzeichen</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 100 }}>Klassen</th>
                <th>Begründung</th>
                <th style={{ width: 75 }}>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {trademarks.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "20px", color: "#78716c" }}>
                    Keine Register-Einträge vorhanden.
                  </td>
                </tr>
              )}
              {trademarks.map((t) => {
                const score = t.relevance_score as number | null;
                const klassen = Array.isArray(t.nizza_klassen)
                  ? (t.nizza_klassen as number[]).join(", ")
                  : String(t.nizza_klassen ?? "—");
                const quelle = (t.quelle as string | null) ?? "DPMA";
                return (
                  <tr key={t.id}>
                    <td>
                      <span
                        className={
                          score != null && score >= 7
                            ? "score-high"
                            : score != null && score >= 4
                            ? "score-med"
                            : "score-low"
                        }
                      >
                        {score ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${quelle === "EUIPO" ? "badge-euipo" : "badge-dpma"}`}>
                        {quelle}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{(t.markenname as string | null) ?? "—"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "10px" }}>
                      {(t.aktenzeichen as string | null) ?? "—"}
                    </td>
                    <td>{(t.workflow_status as string | null) ?? "—"}</td>
                    <td>{klassen}</td>
                    <td>{(t.begruendung as string | null) ?? "—"}</td>
                    <td>{fmtDate(t.created_at as string | null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <footer style={{ marginTop: 40, borderTop: "1px solid #e7e5e4", paddingTop: 12, color: "#78716c", fontSize: "10px" }}>
          Gesamtexport vom {dateStr} · MASTER Brand Monitor · Vertraulich
        </footer>

      </body>
    </html>
  );
}
