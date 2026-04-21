import type { ImpressumProfile } from "./types";
import { scrapeImpressum } from "./impressum-scraper";
import { trackGeminiCall } from "./gemini-usage";

const AGGREGATOR_DOMAINS = new Set([
  "immobilienscout24.de",
  "immoscout24.de",
  "immowelt.de",
  "immonet.de",
  "ebay-kleinanzeigen.de",
  "kleinanzeigen.de",
  "homeday.de",
  "meinestadt.de",
  "gelbeseiten.de",
  "11880.com",
  "dasoertliche.de",
  "dastelefonbuch.de",
  "golocal.de",
  "branchenbuch.de",
  "cylex.de",
  "yelp.de",
  "lifepr.de",
  "presseportal.de",
  "openpr.de",
  "firmenwissen.de",
  "northdata.de",
  "unternehmensregister.de",
  "bundesanzeiger.de",
  "makler-empfehlung.de",
  "wohnpool.de",
  "indeed.com",
  "xing.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "play.google.com",
  "apps.apple.com",
  "support.google.com",
  "sites.google.com",
]);

export function isAggregatorDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return (
    AGGREGATOR_DOMAINS.has(d) ||
    [...AGGREGATOR_DOMAINS].some((a) => d.endsWith("." + a))
  );
}

// Sucht die eigene Website einer Firma via Gemini Grounding und scraped
// deren Impressum. Gibt das Profil von der Firmen-eigenen Domain zurück.
export async function resolveCompanyProfile(
  companyName: string,
): Promise<{ profile: ImpressumProfile | null; resolvedUrl: string | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !companyName) return { profile: null, resolvedUrl: null };

  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const prompt = `Finde die offizielle eigene Website (Haupt-Domain) der deutschen Firma "${companyName}".
Nicht Portale wie immowelt, gelbeseiten, LinkedIn etc.
Antworte NUR mit der URL der Firmen-Website, z.B. "https://www.master-immobilien-berlin.de". Keine Erklärung.`;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);

  try {
    await trackGeminiCall("gemini_resolve");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 },
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) return { profile: null, resolvedUrl: null };

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join(" ") ?? "";

    // URL aus Antwort extrahieren
    const urlMatch = text.match(/https?:\/\/[^\s"',<>]+/);
    if (!urlMatch) return { profile: null, resolvedUrl: null };

    let url = urlMatch[0].replace(/[.)]+$/, "");

    // Resolve Gemini redirect URLs
    if (url.includes("vertexaisearch.cloud.google.com")) {
      try {
        const r = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          headers: { "User-Agent": "MastersBrandMonitor/1.0" },
        });
        url = r.url || url;
      } catch {}
    }

    // Sicherstellen, dass die aufgelöste URL kein Aggregator ist
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (isAggregatorDomain(host)) return { profile: null, resolvedUrl: url };
    } catch {
      return { profile: null, resolvedUrl: null };
    }

    const profile = await scrapeImpressum(url).catch(() => null);
    return { profile, resolvedUrl: url };
  } catch {
    clearTimeout(timeout);
    return { profile: null, resolvedUrl: null };
  }
}
