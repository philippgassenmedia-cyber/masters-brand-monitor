import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/brand";

const HitSchema = z.object({
  url: z.string().optional().nullable(),
  company_name: z.string().min(1),
  title: z.string().optional().nullable(),
  snippet: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  ai_score: z.number().int().min(1).max(10).optional().nullable(),
  ai_reasoning: z.string().optional().nullable(),
  status: z
    .enum(["new", "reviewing", "confirmed", "dismissed", "sent_to_lawyer", "resolved"])
    .default("new"),
  notes: z.string().optional().nullable(),
  violation_category: z
    .enum(["clear_violation", "suspected_violation", "borderline", "generic_use", "own_brand", "other_industry", "not_relevant"])
    .optional()
    .nullable(),
  attachment_url: z.string().optional().nullable(),
});

// Einzelner manueller Treffer oder Bestätigung nach PDF-Extraktion (Array)
export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  // ── PDF-Extraktion ──────────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Keine Datei" }, { status: 400 });
    if (!file.type.includes("pdf"))
      return NextResponse.json({ error: "Nur PDF-Dateien unterstützt" }, { status: 400 });
    if (file.size > 15 * 1024 * 1024)
      return NextResponse.json({ error: "PDF zu groß (max. 15 MB)" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY fehlt" }, { status: 500 });

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const genAI = new GoogleGenerativeAI(apiKey);

    const primaryModel = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    const fallbackModels = ["gemini-2.0-flash", "gemini-1.5-flash"];
    const modelsToTry = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];

    const extractPrompt = `Du bist ein Datenextraktions-Assistent für Markenrechts-Berichte.
Extrahiere ALLE Markenverletzungs-Treffer aus dem beigefügten PDF-Bericht.

Für jeden Treffer erstelle ein JSON-Objekt:
- "company_name": Firmenname der möglichen Verletzer-Firma (Pflichtfeld)
- "url": URL der gefundenen Webseite (null wenn nicht angegeben)
- "title": Seitentitel oder Bezeichnung des Eintrags (kann company_name sein)
- "snippet": Kurzbeschreibung/Kontext aus dem Bericht (max. 400 Zeichen)
- "address": Adresse der Firma (null wenn nicht angegeben)
- "ai_score": Bewertungsscore 1–10 aus dem Bericht (null wenn nicht angegeben)
- "ai_reasoning": Begründung/Notizen des Erstellers (null wenn nicht vorhanden)
- "status": Status aus dem Bericht — eines von:
    "confirmed" (bestätigt/Verletzung),
    "dismissed" (verworfen/keine Verletzung),
    "sent_to_lawyer" (an Anwalt),
    "reviewing" (in Prüfung),
    "resolved" (erledigt),
    "new" (neu/unbearbeitet, Standard)
- "notes": Entscheidungsbegründung oder Notiz des Erstellers (null wenn nicht vorhanden)
- "violation_category": Kategorie — eines von:
    "clear_violation", "suspected_violation", "borderline",
    "generic_use", "own_brand", "other_industry", "not_relevant"
    (schätze ein falls nicht explizit angegeben)

Antworte AUSSCHLIESSLICH mit einem JSON-Array: [{ ... }, { ... }]
Leeres Array [] wenn keine Treffer gefunden.`;

    const parts = [
      extractPrompt,
      { inlineData: { mimeType: "application/pdf", data: base64 } } as const,
    ];

    let lastError: Error | null = null;
    for (const modelId of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelId,
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        });
        const result = await model.generateContent(parts);
        const text = result.response.text();
        const parsed = z.array(HitSchema).parse(JSON.parse(text));

        // Upload PDF to Supabase Storage
        const db = getSupabaseAdminClient();
        const { randomUUID } = await import("node:crypto");
        const storagePath = `imports/${randomUUID()}/${file.name}`;
        let attachmentPath: string | null = null;

        // Ensure bucket exists
        await db.storage.createBucket("hit-attachments", { public: false }).catch(() => {});

        const { error: uploadErr } = await db.storage
          .from("hit-attachments")
          .upload(storagePath, Buffer.from(bytes), { contentType: "application/pdf", upsert: false });

        if (!uploadErr) attachmentPath = storagePath;

        return NextResponse.json({ hits: parsed, count: parsed.length, attachmentPath });
      } catch (e) {
        const msg = (e as Error).message ?? "";
        const isOverload = msg.includes("503") || msg.includes("overloaded") || msg.includes("Service Unavailable");
        lastError = e as Error;
        if (!isOverload) break; // Non-503 error — don't retry with different model
        console.warn(`[import] ${modelId} unavailable, trying next model…`);
      }
    }

    return NextResponse.json(
      { error: `Extraktion fehlgeschlagen: ${lastError?.message.slice(0, 200) ?? "Unbekannter Fehler"}` },
      { status: 500 },
    );
  }

  // ── JSON-Insert (manuell oder nach PDF-Bestätigung) ───────────────────────
  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];
  const parsed = z.array(HitSchema).safeParse(items);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const db = getSupabaseAdminClient();
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const hit of parsed.data) {
    const url = hit.url?.trim() || null;
    const slug = (hit.company_name ?? "import")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60);
    const effectiveUrl = url ?? `imported://${slug}-${Date.now()}-${inserted}`;
    const domain = url ? (hostOf(url) ?? "import") : "import";

    const { error } = await db.from("hits").insert({
      url: effectiveUrl,
      domain,
      title: hit.title ?? hit.company_name,
      snippet: hit.snippet ?? "",
      company_name: hit.company_name,
      address: hit.address ?? null,
      ai_score: hit.ai_score ?? null,
      ai_reasoning: hit.ai_reasoning ?? null,
      ai_is_violation:
        hit.violation_category === "clear_violation" ||
        hit.violation_category === "suspected_violation" ||
        hit.violation_category === "borderline"
          ? true
          : null,
      violation_category: hit.violation_category ?? null,
      status: hit.status,
      notes: hit.notes ?? null,
      ai_model: "imported",
      attachment_url: hit.attachment_url ?? null,
    });

    if (error) {
      // Doppelte URL überspringen (unique constraint)
      if (error.code === "23505") {
        skipped++;
      } else {
        errors.push(`${hit.company_name}: ${error.message}`);
      }
    } else {
      inserted++;
    }
  }

  return NextResponse.json({ inserted, skipped, errors });
}
