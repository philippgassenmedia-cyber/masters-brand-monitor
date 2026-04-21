import * as cheerio from "cheerio";
import type { ImpressumProfile } from "./types";

const IMPRESSUM_PATHS = ["/impressum", "/impressum/"];
const UA =
  "Mozilla/5.0 (compatible; MastersBrandMonitor/1.0; +https://masters-immobilien.example/bot)";

async function fetchText(url: string, timeoutMs = 6_000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function findImpressumLink(html: string, origin: string): string | null {
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = ($(el).text() || "").toLowerCase();
    if (!href) return;
    if (/impressum|imprint|legal notice/.test(text) || /impressum|imprint/.test(href)) {
      candidates.push(href);
    }
  });
  if (!candidates.length) return null;
  try {
    return new URL(candidates[0], origin).toString();
  } catch {
    return null;
  }
}

function extractText($: cheerio.CheerioAPI): string {
  $("script, style, nav, footer, header").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

// Stricter email: TLD must be 2–24 letters, ends on word boundary so we don't
// grab the following word (e.g. "de" + "www" → "dewww").
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,24}(?![a-z])/gi;
const PHONE_RE = /(?:\+?\d[\d\s().\-/]{6,}\d)/g;

// Entfernt typische Labels, Zeilenumbrüche und doppelte Whitespaces.
function cleanField(s: string | null | undefined): string | null {
  if (!s) return null;
  let v = s
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Häufige Label-Präfixe, die der Scraper mitfängt
  v = v.replace(
    /^(Impressum|Unternehmensangaben|Angaben gem(?:\.|äß)? § ?5 TMG|Anbieter|Kontakt|Firma|Adresse|Anschrift)[:\s,.-]*\s*/gi,
    "",
  );
  // Bis zum nächsten Großbuchstaben-Label (Telefon, E-Mail, Fax, USt …)
  v = v.split(/\s+(?:Telefon|Tel\.|E-Mail|Email|Fax|USt|Umsatzsteuer|Geschäftsführer|HRB|Registergericht)\b/i)[0];
  return v.trim() || null;
}

function extractSocial(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const out: Record<string, string> = {};
  const patterns: Array<[string, RegExp]> = [
    ["facebook", /facebook\.com\//i],
    ["instagram", /instagram\.com\//i],
    ["linkedin", /linkedin\.com\//i],
    ["twitter", /(?:twitter|x)\.com\//i],
    ["youtube", /youtube\.com\//i],
    ["tiktok", /tiktok\.com\//i],
    ["xing", /xing\.com\//i],
  ];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    for (const [name, re] of patterns) {
      if (!out[name] && re.test(href)) out[name] = href;
    }
  });
  return out;
}

function extractCompany(text: string): string | null {
  // Non-greedy match + stop am Firmenrechtsform-Suffix.
  const m = text.match(
    /([A-ZÄÖÜ][\wÄÖÜäöüß&.\- ]{2,80}?\s(?:GmbH(?:\s&\sCo\.\sKG)?|UG(?:\s\(haftungsbeschränkt\))?|AG|KG|OHG|e\.K\.|e\.V\.|Ltd\.?|Inc\.?))/,
  );
  return cleanField(m?.[1] ?? null);
}

function extractAddress(text: string): string | null {
  // Straße Hausnr, PLZ Stadt — Stadt endet am nächsten Großbuchstaben-Wort,
  // weil Labels wie "Telefon", "E-Mail" direkt folgen können.
  const m = text.match(
    /([A-ZÄÖÜ][\wÄÖÜäöüß.\-]{2,60}(?:[-\s][\wÄÖÜäöüß.\-]{2,30})?\s\d+[a-z]?\s*,?\s*\d{5}\s[A-ZÄÖÜ][a-zäöüß.\-]{1,40}(?:\s[A-ZÄÖÜ][a-zäöüß.\-]{1,40})?)/,
  );
  return cleanField(m?.[1] ?? null);
}

export async function scrapeImpressum(pageUrl: string): Promise<ImpressumProfile | null> {
  const origin = originOf(pageUrl);
  if (!origin) return null;

  // 1) Try page itself for an Impressum link
  const firstHtml = await fetchText(pageUrl);
  let impressumUrl = firstHtml ? findImpressumLink(firstHtml, origin) : null;

  // 2) Try common paths
  if (!impressumUrl) {
    for (const path of IMPRESSUM_PATHS) {
      const candidate = origin + path;
      const html = await fetchText(candidate);
      if (html && /impressum|imprint/i.test(html)) {
        impressumUrl = candidate;
        break;
      }
    }
  }

  const html = impressumUrl ? await fetchText(impressumUrl) : firstHtml;
  if (!html) return null;

  const $ = cheerio.load(html);
  const text = extractText($);
  const emails = Array.from(new Set(text.match(EMAIL_RE) ?? [])).filter(
    (e) => !/example\.|sentry|wixpress/i.test(e),
  );
  const phones = Array.from(new Set(text.match(PHONE_RE) ?? [])).filter(
    (p) => p.replace(/\D/g, "").length >= 7,
  );

  return {
    company_name: extractCompany(text),
    address: extractAddress(text),
    email: cleanField(emails[0] ?? null),
    phone: cleanField(phones[0] ?? null),
    social_links: extractSocial(html),
    raw: text.slice(0, 8000),
  };
}
