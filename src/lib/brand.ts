import { getSupabaseAdminClient } from "./supabase/server";

export const BRAND_NAME = process.env.BRAND_NAME ?? "MASTER";
export const BRAND_OWNER = process.env.BRAND_OWNER ?? "Masters Immobilien MbH";

// Liste der Firmennamen-Varianten des rechtmäßigen Markeninhabers.
// Hits, deren aufgelöste Firma hiermit übereinstimmt, werden nicht als Verletzung gewertet.
export function ownerNames(): string[] {
  return (process.env.BRAND_OWNER_NAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Normalisiert einen Firmennamen für den Vergleich: lowercased, Rechtsform raus,
// Sonderzeichen raus, Whitespace kollabiert.
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(
      /\s*(gmbh(\s?&\s?co\.?\s?kg)?|ug(\s?\(haftungsbeschränkt\))?|ag|kg|ohg|mbh|e\.?k\.?|e\.?v\.?|ltd\.?|inc\.?)\b/gi,
      "",
    )
    .replace(/[^\wäöüß\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Prüft, ob ein Firmenname zum Markeninhaber gehört.
// WICHTIG: Exakter Match nach Normalisierung. Kein `includes`, sonst würden
// echte Verletzer wie "Master Immobilien Berlin GmbH" fälschlich als Owner
// erkannt, nur weil ihr Name "Master Immobilien" als Substring enthält.
// Der User pflegt Varianten explizit in BRAND_OWNER_NAMES.
export function isOwnerCompany(company: string | null | undefined): boolean {
  if (!company) return false;
  const target = normalizeName(company);
  if (!target) return false;
  const names = ownerNames().map(normalizeName).filter(Boolean);
  if (!names.length) return false;
  return names.includes(target);
}

export function envOwnDomains(): string[] {
  return (process.env.BRAND_OWN_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function loadExcludedDomains(): Promise<Set<string>> {
  const set = new Set<string>(envOwnDomains());
  try {
    const db = getSupabaseAdminClient();
    const { data } = await db.from("excluded_domains").select("domain");
    for (const row of data ?? []) {
      if (row.domain) set.add(String(row.domain).toLowerCase());
    }
  } catch {
    // DB unavailable — fall back to env-only list.
  }
  return set;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isExcluded(url: string, excluded: Set<string>): boolean {
  const host = hostOf(url);
  if (!host) return false;
  for (const d of excluded) {
    if (host === d || host.endsWith("." + d)) return true;
  }
  return false;
}

// Kept for Gemini prompt composition — it only uses the env-level owner list
// to describe the canonical brand owner, not the full excluded list.
export function ownDomains(): string[] {
  return envOwnDomains();
}
