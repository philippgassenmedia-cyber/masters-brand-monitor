import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n;]/.test(s) ? `"${s}"` : s;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("de-DE");
}

export async function GET(req: Request) {
  // Auth check
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";

  const admin = getSupabaseAdminClient();

  // Fetch all hits
  const { data: hitsRaw, error: hitsError } = await admin
    .from("hits")
    .select(
      "id, url, domain, company_name, address, ai_score, violation_category, status, ai_reasoning, ai_recommendation, first_seen_at, last_seen_at, notes, ai_model",
    )
    .order("ai_score", { ascending: false, nullsFirst: false });

  if (hitsError) {
    return NextResponse.json({ error: hitsError.message }, { status: 500 });
  }

  // Fetch all hit_notes grouped by hit_id
  const { data: hitNotesRaw } = await admin
    .from("hit_notes")
    .select("hit_id, text")
    .order("created_at", { ascending: true });

  // Group notes by hit_id
  const notesByHit = new Map<string, string[]>();
  for (const n of hitNotesRaw ?? []) {
    const arr = notesByHit.get(n.hit_id) ?? [];
    arr.push(n.text);
    notesByHit.set(n.hit_id, arr);
  }

  // Fetch all trademarks
  const { data: trademarksRaw, error: tmError } = await admin
    .from("trademarks")
    .select(
      "id, markenname, aktenzeichen, relevance_score, workflow_status, quelle, nizza_klassen, branchenbezug, begruendung, anmelder, created_at",
    )
    .order("relevance_score", { ascending: false, nullsFirst: false });

  if (tmError) {
    return NextResponse.json({ error: tmError.message }, { status: 500 });
  }

  const hits = hitsRaw ?? [];
  const trademarks = trademarksRaw ?? [];

  if (format === "json") {
    return NextResponse.json({ hits, trademarks });
  }

  // Build CSV
  const SEPARATOR = ";";
  const headers = [
    "Typ",
    "Firma/Marke",
    "URL/Aktenzeichen",
    "Score",
    "Status",
    "Kategorie",
    "Quelle",
    "Begründung",
    "Adresse/Klassen",
    "Notizen",
    "Erstellt am",
  ];

  const rows: string[] = [headers.map(csvEscape).join(SEPARATOR)];

  // Hit rows
  for (const h of hits) {
    const notesText = [
      ...(h.notes ? [h.notes as string] : []),
      ...(notesByHit.get(h.id) ?? []),
    ].join(" | ");

    const typ = "Web";

    rows.push(
      [
        typ,
        (h.company_name as string | null) ?? (h.domain as string | null) ?? "",
        (h.url as string | null) ?? (h.domain as string | null) ?? "",
        h.ai_score != null ? String(h.ai_score) : "",
        h.status as string | null,
        h.violation_category as string | null,
        "", // Quelle — not a field on hits
        h.ai_reasoning as string | null,
        h.address as string | null,
        notesText,
        fmtDate(h.first_seen_at as string | null),
      ]
        .map(csvEscape)
        .join(SEPARATOR),
    );
  }

  // Trademark rows
  for (const t of trademarks) {
    const klassen = Array.isArray(t.nizza_klassen)
      ? (t.nizza_klassen as number[]).join(", ")
      : String(t.nizza_klassen ?? "");

    rows.push(
      [
        t.quelle === "EUIPO" ? "EUIPO" : "DPMA",
        t.markenname as string | null,
        t.aktenzeichen as string | null,
        t.relevance_score != null ? String(t.relevance_score) : "",
        t.workflow_status as string | null,
        t.branchenbezug as string | null,
        t.quelle as string | null,
        t.begruendung as string | null,
        klassen,
        t.anmelder as string | null,
        fmtDate(t.created_at as string | null),
      ]
        .map(csvEscape)
        .join(SEPARATOR),
    );
  }

  const BOM = "﻿";
  const csv = BOM + rows.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marken-monitor-export.csv"`,
    },
  });
}
