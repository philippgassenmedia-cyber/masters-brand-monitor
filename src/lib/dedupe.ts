import { cleanCompany, extractCompanyFromText, normalizeAddressKey } from "./profile-cleanup";
import { isOwnerCompany } from "./brand";
import { isAggregatorDomain } from "./resolve-company";
import type { Hit } from "./types";

// Bekannte Immobilien-Portale, die keine eigene Firma sind, sondern nur Listings
// fremder Firmen zeigen. Bei diesen darf der Domain-Name nicht als Firmen-Key
// dienen — sonst würden alle Treffer auf immowelt.de zu einer einzigen Firma.
const AGGREGATOR_DOMAINS = new Set([
  "immobilienscout24.de",
  "immoscout24.de",
  "immoscout24.at",
  "immoscout24.ch",
  "immowelt.de",
  "immowelt.at",
  "immonet.de",
  "ebay-kleinanzeigen.de",
  "kleinanzeigen.de",
  "homeday.de",
  "meinestadt.de",
  "makler-empfehlung.de",
  "maklersuche.de",
  "immostart.de",
  "wohnpool.de",
  "ohne-makler.net",
  "indeed.com",
  "xing.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "play.google.com",
  "apps.apple.com",
  "northdata.de",
  "unternehmensregister.de",
  "bundesanzeiger.de",
]);

function baseDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

function isAggregator(domain: string): boolean {
  const d = baseDomain(domain);
  return AGGREGATOR_DOMAINS.has(d) || [...AGGREGATOR_DOMAINS].some((a) => d.endsWith("." + a));
}

// Normalisiert einen Firmennamen auf einen Schlüssel für die Gruppierung:
// "Master Immobilien GmbH" → "master immobilien"
function normalizeCompany(name: string | null): string | null {
  const cleaned = cleanCompany(name);
  if (!cleaned) return null;
  return cleaned
    .toLowerCase()
    .replace(
      /\s*(gmbh(\s&\sco\.\skg)?|ug(\s\(haftungsbeschränkt\))?|ag|kg|ohg|e\.k\.|e\.v\.|ltd\.?|inc\.?)$/i,
      "",
    )
    .replace(/[^\wäöüß\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

// Zieht den besten Firmennamen aus einem Hit.
// Bei Aggregator-Domains (immowelt, gelbeseiten, presseportale …) gehört
// company_name dem PORTAL-BETREIBER, nicht der eigentlich relevanten Firma.
// Dort wird zuerst aus Reasoning/Snippet extrahiert.
export function resolveCompany(
  hit: Pick<Hit, "company_name" | "domain" | "ai_reasoning" | "snippet">,
): string | null {
  if (!isAggregatorDomain(hit.domain)) {
    const fromName = cleanCompany(hit.company_name);
    if (fromName) return fromName;
  }
  // Bei Aggregatoren oder wenn company_name leer: aus KI-Text extrahieren
  return (
    extractCompanyFromText(hit.ai_reasoning) ??
    extractCompanyFromText(hit.snippet) ??
    cleanCompany(hit.company_name) // letzter Fallback, selbst bei Aggregatoren
  );
}

// Liefert den Schlüssel, unter dem ein Hit gruppiert wird.
//
// Nicht-Aggregator-Domains (= eigene Firmen-Websites) werden IMMER nach Domain
// gruppiert. Das stellt sicher, dass alle Seiten von masterplan-immobilien.de
// zusammen landen, egal ob der Scraper verschiedene Firmennamen-Varianten
// extrahiert hat ("Masterplan Immobilien" vs "Masterplan Immobilien Schwalbach").
//
// Aggregator-Hits werden nach Firmenname+Adresse gruppiert, damit identische
// Firmen auf verschiedenen Portalen zusammenfinden.
export function canonicalKey(
  hit: Pick<Hit, "company_name" | "domain" | "ai_reasoning" | "snippet" | "address" | "url">,
): string {
  const domain = baseDomain(hit.domain);

  // Nicht-Aggregator → Domain ist der stärkste Identifier
  if (!isAggregator(hit.domain)) {
    return `d:${domain}`;
  }

  // Aggregator-Hits nie zusammenführen: company_name + address kommen aus
  // der KI und spiegeln oft den Markeninhaber selbst wider, nicht den Verletzer.
  // Jede URL bekommt eine eigene Gruppe — der Nutzer sieht alle Treffer einzeln.
  return `u:${domain}:${hit.url}`;
}

export interface HitGroup {
  key: string;
  primary: Hit;
  related: Hit[]; // ohne primary
  totalCount: number;
  maxScore: number | null;
}

// Sortierung zur Wahl des Primär-Hits innerhalb einer Gruppe:
// 1. eigener Domain-Hit vor Aggregator-Hit
// 2. höherer AI-Score
// 3. mehr Profil-Daten (company, address, email)
// 4. frühestes first_seen_at
function scoreHit(h: Hit): number {
  let s = 0;
  if (!isAggregator(h.domain)) s += 10_000;
  if (h.ai_score) s += h.ai_score * 100;
  if (h.company_name) s += 20;
  if (h.address) s += 10;
  if (h.email) s += 10;
  if (h.phone) s += 5;
  return s;
}

// Prüft ALLE Kandidaten aus einem Hit gegen die Owner-Namensliste. Dadurch
// werden auch Altdaten gefiltert, bei denen company_name vom Scraper den
// Plattform-Betreiber (UNITED NEWS NETWORK, Immowelt, …) enthält, während
// die eigentliche Firma nur im Gemini-Reasoning oder Snippet steht.
export function hitBelongsToOwner(
  h: Pick<Hit, "company_name" | "ai_reasoning" | "snippet" | "title">,
): boolean {
  const candidates = [
    cleanCompany(h.company_name),
    extractCompanyFromText(h.ai_reasoning),
    extractCompanyFromText(h.snippet),
    extractCompanyFromText(h.title),
  ].filter((c): c is string => !!c);
  return candidates.some(isOwnerCompany);
}

export function groupHits(hits: Hit[]): HitGroup[] {
  // Vor der Gruppierung: Hits rausfiltern, deren aufgelöste Firma der
  // Markeninhaber selbst ist (z.B. Pressemitteilungen über den eigenen Kunden).
  // Wichtig: wir prüfen ALLE Kandidaten (company_name, reasoning, snippet, title),
  // weil bei Aggregator-/Press-Release-Seiten company_name oft den Plattform-
  // Betreiber statt die eigentlich gemeinte Firma enthält.
  const filtered = hits.filter((h) => !hitBelongsToOwner(h));

  const bucket = new Map<string, Hit[]>();
  for (const h of filtered) {
    const k = canonicalKey(h);
    const arr = bucket.get(k) ?? [];
    arr.push(h);
    bucket.set(k, arr);
  }
  const groups: HitGroup[] = [];
  for (const [key, arr] of bucket) {
    const sorted = [...arr].sort((a, b) => scoreHit(b) - scoreHit(a));
    const primary = sorted[0];
    const related = sorted.slice(1);
    const maxScore = sorted.reduce<number | null>(
      (acc, h) => (h.ai_score !== null && (acc === null || h.ai_score > acc) ? h.ai_score : acc),
      null,
    );
    groups.push({ key, primary, related, totalCount: arr.length, maxScore });
  }
  // Gruppen nach maxScore absteigend, dann last_seen_at absteigend
  groups.sort((a, b) => {
    const sa = a.maxScore ?? -1;
    const sb = b.maxScore ?? -1;
    if (sb !== sa) return sb - sa;
    return +new Date(b.primary.last_seen_at) - +new Date(a.primary.last_seen_at);
  });
  return groups;
}
