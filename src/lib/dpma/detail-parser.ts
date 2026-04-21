// Parser für DPMAregister Detail-Seiten (Textinhalt der Seite).
// Extrahiert strukturierte Daten aus dem unformatierten Text.

export interface DpmaDetailData {
  registernummer: string | null;
  altesAktenzeichen: string | null;
  markenform: string | null;
  markenkategorie: string | null;
  anmeldetag: string | null;
  eintragungstag: string | null;
  bekanntmachungstag: string | null;
  veroeffentlichungstag: string | null;
  inhaber: string | null;
  inhaberAnschrift: string | null;
  vertreter: string | null;
  zustellanschrift: string | null;
  klassen: number[];
  bildklassen: string | null;
  warenDienstleistungen: string | null;
  aktenzustand: string | null;
  loeschdatum: string | null;
  schutzendedatum: string | null;
  beginnWiderspruchsfrist: string | null;
  ablaufWiderspruchsfrist: string | null;
  verfahren: string[];
}

/**
 * Hilfsfunktion: sucht ein Feld im DPMAregister-Text.
 * DPMAregister zeigt Labels mit INID-Code, z.B. "InhaberINH(731)"
 * oder "AnmeldetagAT(220)".
 */
function labelField(rawText: string, label: string, code: string): string | null {
  // Muster: "LabelCODE(NNN)" gefolgt vom Wert bis zum nächsten Label
  // Verschiedene Schreibweisen: "Inhaber INH (731)", "InhaberINH(731)", etc.
  const patterns = [
    new RegExp(`${label}\\s*${code}\\s*\\(\\d+\\)\\s*([^\\n]+?)(?=\\s*[A-ZÄÖÜ][a-zäöü]*[A-Z]{2,}|$)`, "s"),
    new RegExp(`${label}\\s*${code}[^)]*\\)\\s*(.+?)(?=\\s*[A-ZÄÖÜ][a-zäöüß]+\\s*[A-Z]{2,}|$)`, "s"),
    new RegExp(`${label}[\\s:]*(.+?)(?=\\s{2,}|\\n|$)`, "s"),
  ];

  for (const re of patterns) {
    const m = rawText.match(re);
    if (m?.[1]) {
      const val = m[1].trim();
      if (val) return val;
    }
  }
  return null;
}

function parseDate(rawText: string, label: string, code: string): string | null {
  const raw = labelField(rawText, label, code);
  if (!raw) return null;
  // Datumsformat: "TT.MM.JJJJ" → "JJJJ-MM-TT"
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Falls bereits ISO-Format
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function parseKlassen(rawText: string): number[] {
  // Suche nach "Nizza-Klassen" oder "Klasse(n)"
  const m = rawText.match(/(?:Nizza-?Klasse(?:n)?|Leitklasse|Klasse)[^:]*[:\s]+([0-9,\s]+)/i);
  if (!m) return [];
  return m[1]
    .split(/[,\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 45);
}

export function parseDpmaDetailPage(rawText: string): DpmaDetailData {
  const text = rawText.replace(/\r\n/g, "\n").replace(/\s+/g, " ");

  const registernummer =
    labelField(text, "Registernummer", "RN") ??
    labelField(text, "Aktenzeichen", "AKZ") ??
    null;

  const altesAktenzeichen = labelField(text, "Altes Aktenzeichen", "AAZ");
  const markenform = labelField(text, "Markenform", "MF");
  const markenkategorie = labelField(text, "Markenkategorie", "MK");

  const anmeldetag = parseDate(text, "Anmeldetag", "AT");
  const eintragungstag = parseDate(text, "Eintragungstag", "ET");
  const bekanntmachungstag = parseDate(text, "Bekanntmachungstag", "BT");
  const veroeffentlichungstag =
    parseDate(text, "Ver.ffentlichungstag", "VT") ??
    parseDate(text, "Veröffentlichungstag", "VT");

  const inhaber = labelField(text, "Inhaber", "INH");
  const inhaberAnschrift = labelField(text, "Inhaber", "INH");
  // Versuche Anschrift separat zu extrahieren
  const inhaberAddr =
    labelField(text, "Anschrift", "ANS") ?? inhaberAnschrift;

  const vertreter = labelField(text, "Vertreter", "VTR");
  const zustellanschrift = labelField(text, "Zustellanschrift", "ZAN");

  const klassen = parseKlassen(rawText);

  // Bildklassen
  const bildklassen = labelField(text, "Bildklasse", "BK");

  // Waren/Dienstleistungen: alles nach "Waren/Dienstleistungen" oder "Verzeichnis"
  let warenDienstleistungen: string | null = null;
  const wdMatch = rawText.match(
    /(?:Waren\s*(?:und|\/)\s*Dienstleistungen|Verzeichnis)[^:]*[:\s]+(.+?)(?=(?:Inhaber|Vertreter|Verfahren|Aktenzustand|$))/is,
  );
  if (wdMatch?.[1]) {
    warenDienstleistungen = wdMatch[1].replace(/\s+/g, " ").trim() || null;
  }

  // Aktenzustand
  const aktenzustand = labelField(text, "Aktenzustand", "AZ");

  const loeschdatum = parseDate(text, "L.schungsdatum", "LD") ?? parseDate(text, "Löschungsdatum", "LD");
  const schutzendedatum =
    parseDate(text, "Schutzdauer", "SD") ??
    parseDate(text, "Schutzende", "SE");

  const beginnWiderspruchsfrist = parseDate(text, "Beginn.*Widerspruchsfrist", "BW");
  const ablaufWiderspruchsfrist = parseDate(text, "Ablauf.*Widerspruchsfrist", "AW");

  // Verfahren
  const verfahren: string[] = [];
  const vMatch = rawText.match(/Verfahren[:\s]+(.+?)(?=(?:Inhaber|Vertreter|$))/is);
  if (vMatch?.[1]) {
    const entries = vMatch[1].split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    verfahren.push(...entries);
  }

  return {
    registernummer,
    altesAktenzeichen,
    markenform,
    markenkategorie,
    anmeldetag,
    eintragungstag,
    bekanntmachungstag,
    veroeffentlichungstag,
    inhaber,
    inhaberAnschrift: inhaberAddr,
    vertreter,
    zustellanschrift,
    klassen,
    bildklassen,
    warenDienstleistungen,
    aktenzustand,
    loeschdatum,
    schutzendedatum,
    beginnWiderspruchsfrist,
    ablaufWiderspruchsfrist,
    verfahren,
  };
}
