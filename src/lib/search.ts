import { trackGeminiCall } from "./gemini-usage";
import { getSupabaseAdminClient } from "./supabase/server";

export type SearchRegion = "deutschland" | "hessen" | "dach" | "eu" | "welt";

export class SearchBudgetExceededError extends Error {
  constructor(used: number, limit: number) {
    super(`Tägliches Suchbudget erschöpft (${used}/${limit})`);
    this.name = "SearchBudgetExceededError";
  }
}

const REGION_LABELS: Record<SearchRegion, string> = {
  deutschland: "Deutschland",
  hessen: "Hessen",
  dach: "Deutschland, Österreich, Schweiz",
  eu: "Europa",
  welt: "Weltweit",
};

const REGION_COUNTRY_CODES: Record<SearchRegion, string | undefined> = {
  deutschland: "DE",
  hessen: "DE",
  dach: undefined,
  eu: undefined,
  welt: undefined,
};

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Returns the number of search API calls made today.
 */
export async function getSearchUsageToday(): Promise<{
  used: number;
  limit: number;
}> {
  const db = getSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("api_usage")
    .select("count")
    .eq("day", today)
    .eq("provider", "gemini_search")
    .maybeSingle();

  const used = Number(data?.count ?? 0);
  const raw = process.env.SEARCH_DAILY_LIMIT;
  const limit = raw ? Number(raw) : 200;

  return { used, limit: Number.isFinite(limit) ? limit : 200 };
}

/**
 * Gemini grounded search using the google_search tool.
 * Performs a web search via Gemini API with Google Search grounding.
 */
export async function searchWeb(
  query: string,
  region: SearchRegion = "deutschland",
): Promise<SearchResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  // Budget check
  const { used, limit } = await getSearchUsageToday();
  if (used >= limit) {
    throw new SearchBudgetExceededError(used, limit);
  }

  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const regionLabel = REGION_LABELS[region];

  const regionHint =
    region === "hessen"
      ? " in Hessen (Bundesland)"
      : region === "dach"
        ? " in Deutschland, Österreich oder der Schweiz"
        : region === "eu"
          ? " in Europa"
          : region === "welt"
            ? ""
            : " in Deutschland";

  const systemPrompt = `Du bist ein Web-Recherche-Assistent. Suche nach dem gegebenen Begriff${regionHint}.
Gib die Ergebnisse als JSON-Array zurück. Jedes Element hat: title, url, snippet.
Maximal 10 Ergebnisse. Keine Einleitung, nur JSON.`;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 45_000);

  try {
    await trackGeminiCall("gemini_search");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: query }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 },
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Gemini search failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // Extract grounding results from the response
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks ?? [];

    // Try to get structured results from grounding chunks
    if (groundingChunks.length > 0) {
      const raw = groundingChunks
        .filter((chunk: { web?: { uri: string; title: string } }) => chunk.web?.uri)
        .map((chunk: { web: { uri: string; title: string } }) => ({
          title: chunk.web.title || "",
          url: chunk.web.uri,
          snippet: "",
        })) as SearchResult[];

      // Resolve vertexaisearch redirect URLs in parallel.
      // Strategy: HEAD first (fast), fall back to GET if HEAD is rejected (405)
      // or times out. Both attempts follow redirects and read resp.url.
      const resolved = await Promise.all(
        raw.map(async (r) => {
          if (!r.url.includes("vertexaisearch.cloud.google.com")) return r;
          const tryFetch = async (method: "HEAD" | "GET") => {
            const ctrl2 = new AbortController();
            const t = setTimeout(() => ctrl2.abort(), 10_000);
            try {
              const resp = await fetch(r.url, {
                method,
                redirect: "follow",
                headers: { "User-Agent": "Mozilla/5.0 (compatible; MastersBrandMonitor/1.0)" },
                signal: ctrl2.signal,
              });
              clearTimeout(t);
              return resp.url || null;
            } catch {
              clearTimeout(t);
              return null;
            }
          };
          const finalUrl =
            (await tryFetch("HEAD")) ??
            (await tryFetch("GET")) ??
            r.url;
          // Only replace if we actually resolved away from vertexaisearch
          if (finalUrl.includes("vertexaisearch.cloud.google.com")) return r;
          return { ...r, url: finalUrl };
        }),
      );
      return resolved;
    }

    // Fall back to parsing the text response
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    // Try to parse as JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as SearchResult[];
        return parsed.filter((r) => r.url && r.title);
      } catch {
        // Fall through to empty
      }
    }

    // Extract URLs from plain text as last resort
    const urlMatches = text.matchAll(/https?:\/\/[^\s"',<>]+/g);
    const results: SearchResult[] = [];
    for (const m of urlMatches) {
      const url = m[0].replace(/[.)]+$/, "");
      results.push({ title: "", url, snippet: "" });
    }
    return results;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}
