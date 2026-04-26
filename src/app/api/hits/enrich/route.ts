import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { trackGeminiCall } from "@/lib/gemini-usage";

const CONCURRENCY = 5;

interface EnrichResult {
  company: string | null;
  address: string | null;
}

async function extractFromText(
  title: string,
  snippet: string,
  reasoning: string | null,
): Promise<EnrichResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { company: null, address: null };

  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const prompt = `Extrahiere aus diesen Informationen den Firmennamen und den Standort der Firma, die potenziell eine Marke verletzt:

Titel: ${title}
Snippet: ${snippet}
${reasoning ? `Analyse: ${reasoning}` : ""}

Antworte NUR mit JSON (kein Markdown):
{"company": "<vollständiger Firmenname mit Rechtsform wenn erkennbar, oder null>", "address": "<Adresse oder Stadt, oder null>"}`;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);

  try {
    await trackGeminiCall("gemini_analyze");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return { company: null, address: null };

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        company: parsed.company ?? null,
        address: parsed.address ?? null,
      };
    }
  } catch {
    clearTimeout(timeout);
  }
  return { company: null, address: null };
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();

  const [{ count: missing }, { count: total }] = await Promise.all([
    db
      .from("hits")
      .select("id", { count: "exact", head: true })
      .or("company_name.is.null,address.is.null")
      .not("ai_reasoning", "is", null),
    db.from("hits").select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({ missing: missing ?? 0, total: total ?? 0 });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const force = body.force === true;
  const batchSize = Math.min(Number(body.batch ?? 20), 50);

  const db = getSupabaseAdminClient();

  let query = db
    .from("hits")
    .select("id, title, snippet, ai_reasoning, company_name, address")
    .not("ai_reasoning", "is", null)
    .order("ai_score", { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (!force) {
    query = query.or("company_name.is.null,address.is.null");
  }

  const { data: hits } = await query;
  if (!hits?.length) return NextResponse.json({ processed: 0, updated: 0, remaining: 0 });

  let updated = 0;

  for (let i = 0; i < hits.length; i += CONCURRENCY) {
    const chunk = hits.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (hit) => {
        const result = await extractFromText(
          hit.title ?? "",
          hit.snippet ?? "",
          hit.ai_reasoning,
        );

        const patch: Record<string, string | null> = {};
        if (result.company && (!hit.company_name || force)) patch.company_name = result.company;
        if (result.address && (!hit.address || force)) patch.address = result.address;

        if (Object.keys(patch).length === 0) return;

        await db.from("hits").update(patch).eq("id", hit.id);
        updated++;
      }),
    );
  }

  const { count: remaining } = await db
    .from("hits")
    .select("id", { count: "exact", head: true })
    .or("company_name.is.null,address.is.null")
    .not("ai_reasoning", "is", null);

  return NextResponse.json({ processed: hits.length, updated, remaining: remaining ?? 0 });
}
