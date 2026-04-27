import { cleanCompany, extractCompanyFromText, normalizeAddressKey } from "./profile-cleanup";
import { isOwnerCompany } from "./brand";
import { isAggregatorDomain } from "./resolve-company";
import type { Hit } from "./types";

// Wichtige deutsche Städtenamen, die in Firmennamen auftauchen und den
// Gruppierungsschlüssel destabilisieren würden.
// "Master Immobilien Frankfurt GmbH" und "Master Immobilien GmbH" sollen
// zum selben Schlüssel führen — daher wird der Städtename aus dem
// normalisierten Firmenname herausgestrichen.
const CITY_RE =
  /\b(frankfurt(?:[\s-]+am[\s-]+main)?|münchen|berlin|hamburg|köln|cologne|stuttgart|düsseldorf|hannover|nürnberg|nuremberg|dresden|bremen|dortmund|essen|wiesbaden|kassel|darmstadt|mainz|heidelberg|freiburg(?:[\s-]+im[\s-]+breisgau)?|mannheim|augsburg|karlsruhe|bonn|münster|bielefeld|wuppertal|bochum|gelsenkirchen|aachen|chemnitz|magdeburg|braunschweig|kiel|erfurt|rostock|saarbrücken|potsdam|lübeck|oldenburg|regensburg|ingolstadt|ulm|heilbronn|pforzheim|offenbach|würzburg|wolfsburg|göttingen|koblenz|trier|erlangen|bayreuth|passau|krefeld|mönchengladbach|oberhausen|osnabrück|leverkusen|paderborn|reutlingen|tübingen|friedrichshafen|ravensburg|konstanz|landshut|bamberg|jena|gera|cottbus|schwerin|bremerhaven|hanau|rüsselsheim|gießen|marburg|fulda|hildesheim|lüneburg|norderstedt|salzgitter|emden|wilhelmshaven|remscheid|moers|solingen|witten|herne|iserlohn|bottrop|recklinghausen|münster)\b/gi;

function baseDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

// Normalisiert einen Firmennamen für den Gruppierungsschlüssel:
// 1. cleanCompany (Plausibilitätsprüfung)
// 2. Lowercase
// 3. Rechtsform-Suffix entfernen
// 4. Deutschen Städtenamen entfernen (verhindert Split bei Varianten)
// 5. Sonderzeichen → Leerzeichen, Whitespace kollabieren
function normalizeCompany(name: string | null): string | null {
  const cleaned = cleanCompany(name);
  if (!cleaned) return null;
  const result = cleaned
    .toLowerCase()
    .replace(
      /\s*(gmbh(\s?&\s?co\.?\s?kg)?|ug(\s?\(haftungsbeschr[äa]nkt\))?|ag|kg|ohg|e\.?\s?k\.?|e\.?\s?v\.?|ltd\.?|inc\.?|mbh)\b/gi,
      "",
    )
    .replace(CITY_RE, "")
    .replace(/\bam\s+main\b|\bim\s+breisgau\b/gi, "")
    .replace(/[^\wäöüß\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return result || null;
}

// Normalisiert einen Stadtnamen für den Schlüssel: entfernt geografische Zusätze
// ("am Main", "im Breisgau" etc.) damit "Frankfurt" und "Frankfurt am Main" denselben Key ergeben.
function normalizeCityKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s\-]+am[\s\-]+main/g, "")
    .replace(/[\s\-]+im[\s\-]+breisgau/g, "")
    .replace(/[\s\-]+an[\s\-]+der[\s\-]+\w+/g, "")
    .replace(/[\s\-]+/g, "-")
    .replace(/-+$/, "")
    .trim();
}

// Extrahiert den stabilen Ortsschlüssel aus einer Adresse.
// PLZ+Stadt hat Vorrang, dann Stadtname allein (aus CITY_RE).
function extractLocationKey(address: string | null | undefined): string | null {
  if (!address) return null;
  const full = normalizeAddressKey(address);
  if (full) {
    return full.split(":").slice(0, 2).join(":");
  }
  // Explizite Städteliste — zuverlässiger als generischer Uppercase-Match
  const m = address.match(CITY_RE);
  if (m) return `c:${normalizeCityKey(m[0])}`;
  return null;
}

// Extrahiert einen Ortsschlüssel direkt aus dem Firmennamen,
// falls kein Adressfeld befüllt ist.
// "Master Immobilien Frankfurt GmbH" → "c:frankfurt"
function extractCityFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = name.match(CITY_RE);
  if (!m) return null;
  return `c:${normalizeCityKey(m[0])}`;
}

// Gibt true wenn der Firmenname eine Rechtsform enthält (GmbH, AG …).
function hasLegalSuffix(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\b(gmbh(\s?&\s?co\.?\s?kg)?|ug(\s?\(haftungsbeschr[äa]nkt\))?|ag|kg|ohg|e\.?\s?k\.?|e\.?\s?v\.?|ltd\.?|inc\.?|mbh)\b/i.test(name);
}

// Zieht den besten Firmennamen aus einem Hit für die Anzeige.
export function resolveCompany(
  hit: Pick<Hit, "company_name" | "domain" | "ai_reasoning" | "snippet">,
): string | null {
  if (!isAggregatorDomain(hit.domain)) {
    const fromName = cleanCompany(hit.company_name);
    if (fromName) return fromName;
  }
  return (
    extractCompanyFromText(hit.ai_reasoning) ??
    extractCompanyFromText(hit.snippet) ??
    cleanCompany(hit.company_name)
  );
}

// Liefert den Schlüssel, unter dem ein Hit gruppiert wird.
//
// Nicht-Aggregator-Domains (eigene Firmen-Websites) → immer nach Domain,
// damit alle Seiten von masterplan-immobilien.de zusammen landen.
//
// Aggregator-Domains (immoscout, immowelt, gelbeseiten, yelp, presseportal …)
// → nach normalisiertem Firmenname + Ort. Prioritäten für Ort:
//   1. address-Feld (PLZ+Stadt oder Stadtname)
//   2. Stadt im Firmennamen ("Master Immobilien Frankfurt GmbH")
//   3. Kein Ort, aber Rechtsform → Firmenname allein (DE-Recht: eindeutig)
//   4. Zu wenig Info → URL-spezifische Fallback-Gruppe
//
// Wichtig: isAggregatorDomain stammt aus resolve-company.ts (zentrale Liste),
// nicht aus einer duplizierten lokalen Liste.
export function canonicalKey(
  hit: Pick<Hit, "company_name" | "domain" | "ai_reasoning" | "snippet" | "address" | "url">,
): string {
  const domain = baseDomain(hit.domain);

  if (!isAggregatorDomain(hit.domain)) {
    return `d:${domain}`;
  }

  // Firmenname: zuerst gespeichertes Feld, Fallback auf Snippet-Extraktion.
  // Reasoning wird NICHT genutzt — es enthält immer den Markennamen selbst.
  const nameRaw = hit.company_name ?? extractCompanyFromText(hit.snippet);
  const normalized = normalizeCompany(nameRaw);
  if (!normalized) return `u:${domain}:${hit.url}`;

  const wordCount = normalized.trim().split(/\s+/).length;
  const legal = hasLegalSuffix(nameRaw);

  // Zu generisch ohne Rechtsform: "master" allein kann nicht sicher gruppiert werden
  if (wordCount < 2 && !legal) return `u:${domain}:${hit.url}`;

  // Ort: address-Feld → Stadt aus Firmennamen → keiner
  const locKey = extractLocationKey(hit.address) ?? extractCityFromName(nameRaw);

  if (locKey) return `ca:${normalized}|${locKey}`;

  // Rechtsform ohne Ort: GmbH-Namen sind in DE juristisch eindeutig
  if (legal) return `ca:${normalized}`;

  // ≥3 Wörter ohne Ort: spezifisch genug zum Gruppieren
  if (wordCount >= 3) return `ca:${normalized}`;

  return `u:${domain}:${hit.url}`;
}

export interface HitGroup {
  key: string;
  primary: Hit;
  related: Hit[];
  totalCount: number;
  maxScore: number | null;
}

function scoreHit(h: Hit): number {
  let s = 0;
  if (!isAggregatorDomain(h.domain)) s += 10_000;
  if (h.ai_score) s += h.ai_score * 100;
  if (h.company_name) s += 20;
  if (h.address) s += 10;
  if (h.email) s += 10;
  if (h.phone) s += 5;
  return s;
}

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
      (acc, h) =>
        h.ai_score !== null && (acc === null || h.ai_score > acc) ? h.ai_score : acc,
      null,
    );
    groups.push({ key, primary, related, totalCount: arr.length, maxScore });
  }

  groups.sort((a, b) => {
    const sa = a.maxScore ?? -1;
    const sb = b.maxScore ?? -1;
    if (sb !== sa) return sb - sa;
    return +new Date(b.primary.last_seen_at) - +new Date(a.primary.last_seen_at);
  });
  return groups;
}
