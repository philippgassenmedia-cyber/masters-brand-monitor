import { getSupabaseAdminClient } from "./supabase/server";

// Zentrale Tracking-Funktion für ALLE Gemini-API-Calls.
// Provider-Kategorien:
//   gemini_search    — Web-Suche (Grounding)
//   gemini_analyze   — Web-Hit-Bewertung
//   gemini_dpma      — DPMA-Klassifizierung
//   gemini_resolve   — Website-Resolution
//   gemini_parse     — Mail-Parsing

export async function trackGeminiCall(
  provider:
    | "gemini_search"
    | "gemini_analyze"
    | "gemini_dpma"
    | "gemini_resolve"
    | "gemini_parse",
): Promise<void> {
  try {
    const db = getSupabaseAdminClient();
    await db.rpc("increment_api_usage", { p_provider: provider, p_delta: 1 });
  } catch {
    // Tracking-Fehler soll Pipeline nicht blockieren
  }
}

export async function getGeminiUsageToday(): Promise<{
  total: number;
  breakdown: Record<string, number>;
  limit: number;
}> {
  const db = getSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("api_usage")
    .select("provider, count")
    .eq("day", today)
    .like("provider", "gemini_%");

  const breakdown: Record<string, number> = {};
  let total = 0;
  for (const row of data ?? []) {
    const count = Number(row.count) || 0;
    breakdown[row.provider as string] = count;
    total += count;
  }

  const raw = process.env.SEARCH_DAILY_LIMIT;
  const limit = raw ? Number(raw) : 200;

  return { total, breakdown, limit: Number.isFinite(limit) ? limit : 200 };
}
