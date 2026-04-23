// Säubert vom Scraper gelieferte Profil-Felder on-the-fly, damit auch Altdaten
// aus vorherigen Scans im UI sauber dargestellt werden.

const LABEL_PREFIX =
  /^(Impressum|Unternehmensangaben|Angaben gem(?:\.|äß)? § ?5 TMG|Anbieter|Kontakt|Firma|Adresse|Anschrift)[:\s,.-]*\s*/gi;

const NEXT_LABEL_SPLIT =
  /\s+(?:Telefon|Tel\.|E-Mail|Email|Fax|USt|Umsatzsteuer|Geschäftsführer|HRB|Registergericht|Website|Web|Internet)\b/i;

export function cleanFreeText(s: string | null | undefined): string | null {
  if (!s) return null;
  let v = s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  // Labels können gestapelt sein ("Impressum Unternehmensangaben ..."), daher
  // mehrfach strippen bis nichts mehr matcht.
  let prev = "";
  while (prev !== v) {
    prev = v;
    v = v.replace(LABEL_PREFIX, "");
  }
  v = v.split(NEXT_LABEL_SPLIT)[0];
  return v.trim() || null;
}

// Wenn mehrere Adressteile ohne Trennzeichen zusammenkleben:
// "MasterGround GmbHFranz-Kirrmeier-Straße 1767346 Speyer"
// → "Franz-Kirrmeier-Straße 17, 67346 Speyer"
export function cleanAddress(s: string | null | undefined): string | null {
  const cleaned = cleanFreeText(s);
  if (!cleaned) return null;
  // Firma (meist endet auf GmbH/UG/AG/…) vom Straßennamen trennen, falls ohne Leerzeichen
  let v = cleaned.replace(
    /((?:GmbH(?:\s&\sCo\.\sKG)?|UG(?:\s\(haftungsbeschränkt\))?|AG|KG|OHG|e\.K\.|e\.V\.|Ltd\.?|Inc\.?))([A-ZÄÖÜ])/g,
    "$1, $2",
  );
  // PLZ + Stadt sauber separieren: "1767346 Speyer" → "17, 67346 Speyer"
  v = v.replace(/(\d+[a-z]?)(\d{5}\s)/g, "$1, $2");
  // Falls Firma vorn drangeklebt ist, nur den Teil ab der Straße zurückgeben
  const streetStart = v.search(
    /[A-ZÄÖÜ][\wÄÖÜäöüß.\-]{2,}(?:[- ][\wÄÖÜäöüß.\-]{2,})?\s\d+[a-z]?/,
  );
  if (streetStart > 0) v = v.slice(streetStart);
  return v.trim() || null;
}

// E-Mail aus evtl. verklebtem String herauslösen.
export function cleanEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-zA-Z]{2,24}(?![a-zA-Z])/);
  return m?.[0] ?? null;
}

export function cleanPhone(s: string | null | undefined): string | null {
  const cleaned = cleanFreeText(s);
  if (!cleaned) return null;
  const m = cleaned.match(/(\+?\d[\d\s().\-/]{6,}\d)/);
  return m?.[1]?.trim() ?? null;
}

export function cleanCompany(s: string | null | undefined): string | null {
  const cleaned = cleanFreeText(s);
  if (!cleaned) return null;
  const found = findCompanyAroundLegal(cleaned);
  if (found) return found;
  return isPlausibleCompanyName(cleaned) ? cleaned : null;
}

const NON_COMPANY_STARTS =
  /^(der|die|das|den|dem|des|ein|eine|einem|eines|einer|wie|was|wer|warum|hier|neue|aktuelle|regelungen|informationen|firma|unternehmen|gesellschaft|verein|web|seite|fundstelle|these|dieser|dieses|diese|laut|auf|bei|mit|für|von|zur|zum|nach|über|unter|seit|durch|alle|weitere|andere|fund|zeigt|bietet|enthält|beschreibt|betrifft|nennt|listet|sucht|findet|hat|ist|wird|wurde|gehört|verwendet|nutzt|vermittelt|betreibt|befindet|stellt|operiert|ergibt|lässt|kann|soll|muss|darf)\b/i;

function isPlausibleCompanyName(s: string): boolean {
  if (!s || s.length < 4) return false;
  if (s.length > 80) return false;
  if (s.split(/[\s\-]/).filter(Boolean).length < 2) return false;
  if (/[?!:]/.test(s)) return false;
  if (NON_COMPANY_STARTS.test(s)) return false;
  return true;
}

// Sucht in einem freien Text (z.B. Gemini-Reasoning oder Snippet) nach einem
// Rechtsform-Suffixe
const LEGAL_RE =
  /(?:GmbH(?:\s?&\s?Co\.?\s?KG)?|UG(?:\s?\(haftungsbeschr[äa]nkt\))?|AG|KG|OHG|e\.?\s?K\.?|e\.?\s?V\.?|Ltd\.?|Inc\.?|MbH|mbH)/g;

// Sucht Firmennamen im Text durch „Rückwärts-Suche" von der Rechtsform:
// Findet z.B. "GmbH" und schaut dann bis zu 60 Zeichen davor, wo der Name
// mit einem Großbuchstaben beginnt. Damit wird "Die Firma MasterGround GmbH"
// korrekt als "MasterGround GmbH" extrahiert, nicht "Die Firma MasterGround GmbH".
// Findet Firmennamen indem wir von der Rechtsform RÜCKWÄRTS suchen.
// Probiert die längste plausible Wortgruppe vor dem Suffix.
function findCompanyAroundLegal(s: string): string | null {
  LEGAL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LEGAL_RE.exec(s)) !== null) {
    const before = s.slice(Math.max(0, match.index - 80), match.index);
    const words = before.split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    // Letztes Wort: trailing Bindestriche entfernen (z.B. "ImmoMaster-" vor "GmbH")
    const lastWord = words[words.length - 1].replace(/[-]+$/, "");
    words[words.length - 1] = lastWord;

    // Separator: Bindestrich wenn der Originaltext direkt "-GmbH" hatte
    const charBefore = s[match.index - 1];
    const sep = charBefore === "-" ? "-" : " ";

    // Längste Kombination zuerst, aber führende Satz-Wörter automatisch trimmen
    for (let n = Math.min(6, words.length); n >= 1; n--) {
      const nameWords = words.slice(-n);
      if (!/^[A-ZÄÖÜ0-9]/.test(nameWords[0])) continue;
      const full = nameWords.join(" ") + sep + match[0];
      // Führende Nicht-Firmen-Wörter abschneiden
      const parts = full.trim().split(/\s+/);
      while (parts.length > 2 && NON_COMPANY_STARTS.test(parts[0])) parts.shift();
      const cleaned = parts.join(" ");
      if (isPlausibleCompanyName(cleaned)) return cleaned;
    }
  }
  return null;
}

// Normalisiert eine Adresse auf einen Dedup-Schlüssel:
// "Franz-Kirrmeier-Straße 17, 67346 Speyer" → "67346:speyer:franz-kirrmeier-strasse:17"
// Wichtig: PLZ + Stadt reichen meistens, Straße als Tie-Breaker.
export function normalizeAddressKey(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = cleanAddress(s);
  if (!cleaned) return null;
  // PLZ extrahieren
  const plzMatch = cleaned.match(/(\d{5})/);
  if (!plzMatch) return null;
  const plz = plzMatch[1];
  // Stadt: erstes Wort nach PLZ
  const afterPlz = cleaned.slice(cleaned.indexOf(plz) + 5).trim();
  const cityMatch = afterPlz.match(/^([A-ZÄÖÜa-zäöüß.\-]{2,}(?:\s[A-Za-zÄÖÜäöüß.\-]{2,})?)/);
  const city = cityMatch ? cityMatch[1].toLowerCase().replace(/[.\-]/g, "") : "";
  // Straße: vor PLZ
  const beforePlz = cleaned.slice(0, cleaned.indexOf(plz)).trim().replace(/,\s*$/, "");
  const street = beforePlz
    .toLowerCase()
    .replace(/straße|strasse/g, "str")
    .replace(/[^\wäöüß\s]/g, "")
    .replace(/\s+/g, "-")
    .trim();
  if (!plz || !city) return null;
  return `${plz}:${city}${street ? ":" + street : ""}`;
}

/** Extrahiert Geschäftsführer/Inhaber aus rohem Impressum-Text */
export function parseGeschaeftsfuehrer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(
    /(?:Geschäftsführer(?:in)?|Vertretungsberechtigte?r?|Inhaber(?:in)?|CEO|Managing Director)[:\s]+([A-ZÄÖÜ][a-zäöüß][\wÄÖÜäöüß.\- ]{1,60}?)(?=\s*(?:Telefon|Tel\.|E-Mail|Email|Fax|USt|HRB|Registergericht|Amtsgericht|Anschrift|Adresse|Web|\n|$))/i,
  );
  if (!m?.[1]) return null;
  return m[1].trim().replace(/[,;.]+$/, "") || null;
}

export function extractCompanyFromText(s: string | null | undefined): string | null {
  if (!s) return null;
  // 1) Gemini schreibt Firmennamen in Anführungszeichen
  const quoted = s.match(/["„»«'‚']([^"„»«'‚']{3,80})["»«'‛']/);
  if (quoted) {
    const c = cleanCompany(quoted[1]);
    if (c) return c;
  }
  // 2) Rückwärts-Suche ab Rechtsform-Suffix
  return findCompanyAroundLegal(s);
}
