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

// Extrahiert den kürzesten stabilen Ortsschlüssel aus einer Adresse.
// Versucht zuerst PLZ+Stadt, dann PLZ allein, dann nur Stadtname.
// Gibt null zurück wenn kein Ort erkennbar.
function extractLocationKey(address: string | null | undefined): string | null {
  if (!address) return null;
  // PLZ+Stadt via normalizeAddressKey (liefert "PLZ:stadt" oder "PLZ:stadt:strasse")
  const full = normalizeAddressKey(address);
  if (full) {
    const parts = full.split(":");
    return parts.slice(0, 2).join(":"); // nur PLZ:stadt, ohne Strasse
  }
  // Kein PLZ — versuche nur Stadtname ("Frankfurt am Main", "München")
  const cityMatch = address.match(/\b([A-ZÄÖÜ][a-zäöüß]{2,}(?:[\s\-][A-Za-zÄÖÜäöüß]{2,}){0,2})\b/);
  if (cityMatch) return `c:${cityMatch[1].toLowerCase().replace(/[\s\-]+/g, "-")}`;
  return null;
}

// Gibt true wenn der Firmenname eine Rechtsform enthält (GmbH, AG …).
// Rechtsformen machen Namen juristisch eindeutig → weniger strikte Adresspflicht.
function hasLegalSuffix(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\b(gmbh(\s?&\s?co\.?\s?kg)?|ug(\s?\(haftungsbeschr[äa]nkt\))?|ag|kg|ohg|e\.?\s?k\.?|e\.?\s?v\.?|ltd\.?|inc\.?|mbh)\b/i.test(name);
}

// Liefert den Schlüssel, unter dem ein Hit gruppiert wird.
//
// Nicht-Aggregator-Domains (= eigene Firmen-Websites) werden IMMER nach Domain
// gruppiert. Das stellt sicher, dass alle Seiten von masterplan-immobilien.de
// zusammen landen, egal ob der Scraper verschiedene Firmennamen-Varianten
// extrahiert hat ("Masterplan Immobilien" vs "Masterplan Immobilien Schwalbach").
//
// Aggregator-Hits (immoscout, immowelt, …) werden nach Firmenname+Ort gruppiert,
// damit identische Firmen auf verschiedenen Portalen zusammenfinden.
// Anforderungen werden bewusst NIEDRIG gehalten, weil Gemini oft nur Stadtname
// oder PLZ+Stadt liefert, selten die volle Straße.
export function canonicalKey(
  hit: Pick<Hit, "company_name" | "domain" | "ai_reasoning" | "snippet" | "address" | "url">,
): string {
  const domain = baseDomain(hit.domain);

  // Nicht-Aggregator → Domain ist der stärkste Identifier
  if (!isAggregator(hit.domain)) {
    return `d:${domain}`;
  }

  // Firmennamen normalisieren (einmal bereinigen)
  const normalized = normalizeCompany(hit.company_name);
  if (!normalized) return `u:${domain}:${hit.url}`;

  const wordCount = normalized.trim().split(/\s+/).length;
  const legal = hasLegalSuffix(hit.company_name);

  // Mindestens 2 Wörter ODER eine Rechtsform — schützt vor Einzel-Tokens wie "Master"
  if (wordCount < 2 && !legal) return `u:${domain}:${hit.url}`;

  const locKey = extractLocationKey(hit.address);

  // Mit Ort: immer gruppieren (PLZ+Stadt oder Stadtname reichen)
  if (locKey) return `ca:${normalized}|${locKey}`;

  // Ohne Ort: nur bei gesicherter Rechtsform (GmbH-Namen sind in DE juristisch eindeutig)
  if (legal) return `ca:${normalized}`;

  // Kein Ort, keine Rechtsform → zu unsicher zum Gruppieren
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
