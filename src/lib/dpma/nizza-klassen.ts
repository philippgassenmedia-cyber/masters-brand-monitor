// Alle 45 Nizza-Klassen mit deutschen Beschreibungen.
// Quelle: DPMA Nizza-Klassifikation

export const NIZZA_BESCHREIBUNG: Record<number, string> = {
  1: "Chemische Erzeugnisse für gewerbliche, wissenschaftliche, fotografische, land-, garten- und forstwirtschaftliche Zwecke",
  2: "Farben, Firnisse, Lacke; Rostschutzmittel, Holzkonservierungsmittel; Färbemittel, Beizen",
  3: "Wasch- und Bleichmittel; Putz-, Polier-, Fettentfernungs- und Schleifmittel; Parfümerien, Kosmetika",
  4: "Technische Öle und Fette; Schmiermittel; Brennstoffe; Kerzen und Dochte",
  5: "Pharmazeutische und veterinärmedizinische Erzeugnisse; Hygienepräparate für medizinische Zwecke",
  6: "Unedle Metalle und deren Legierungen; Baumaterialien aus Metall; Schlosserwaren und Kleineisenwaren",
  7: "Maschinen und Werkzeugmaschinen; Motoren (ausgenommen für Landfahrzeuge); Kupplungen und Vorrichtungen zur Kraftübertragung",
  8: "Handwerkzeuge und -geräte; Messerschmiedewaren, Gabeln und Löffel; Hieb- und Stichwaffen",
  9: "Wissenschaftliche, Schifffahrts-, Vermessungs-, fotografische, Film-, optische Apparate und Instrumente; Software",
  10: "Chirurgische, ärztliche, zahn- und tierärztliche Instrumente und Apparate; orthopädische Artikel",
  11: "Beleuchtungs-, Heizungs-, Dampferzeugungs-, Koch-, Kühl-, Trocken-, Lüftungs- und Wasserleitungsgeräte",
  12: "Fahrzeuge; Apparate zur Beförderung auf dem Lande, in der Luft oder auf dem Wasser",
  13: "Schusswaffen; Munition und Geschosse; Sprengkörper; Feuerwerkskörper",
  14: "Edelmetalle und deren Legierungen; Juwelierwaren, Schmuckwaren, Edelsteine; Uhren und Zeitmessinstrumente",
  15: "Musikinstrumente",
  16: "Papier, Pappe (Karton); Druckereierzeugnisse; Buchbindeartikel; Schreibwaren; Büroartikel",
  17: "Kautschuk, Guttapercha, Gummi, Asbest, Glimmer; Waren daraus; Dichtungs-, Packungs- und Isoliermaterial",
  18: "Leder und Lederimitationen; Häute und Felle; Reiseartikel und Sattlerwaren; Regenschirme",
  19: "Baumaterialien (nicht aus Metall); Rohre (nicht aus Metall); Asphalt, Pech, Teer; Transportable Bauten",
  20: "Möbel, Spiegel, Bilderrahmen; Waren aus Holz, Kork, Rohr, Binsen, Weide, Horn, Knochen, Elfenbein",
  21: "Geräte und Behälter für Haushalt und Küche; Kämme und Schwämme; Glaswaren, Porzellan und Steingut",
  22: "Seile, Bindfaden, Netze, Zelte, Planen, Segel; Polsterfüllstoffe; Gespinstfasern",
  23: "Garne und Fäden für textile Zwecke",
  24: "Webstoffe und Textilwaren; Bett- und Tischdecken",
  25: "Bekleidungsstücke, Schuhwaren, Kopfbedeckungen",
  26: "Spitzen und Stickereien, Bänder und Schnürbänder; Knöpfe, Haken und Ösen; Nadeln",
  27: "Teppiche, Fußmatten, Matten, Linoleum; Tapeten (ausgenommen aus textilem Material)",
  28: "Spiele und Spielzeug; Turn- und Sportartikel; Christbaumschmuck",
  29: "Fleisch, Fisch, Geflügel und Wild; Fleischextrakte; Obst und Gemüse (konserviert, getrocknet, gekocht)",
  30: "Kaffee, Tee, Kakao und Kaffee-Ersatzmittel; Reis, Nudeln; Mehl; Brot, Konditorwaren; Zucker, Honig",
  31: "Land-, garten- und forstwirtschaftliche Erzeugnisse; Saatgut; lebende Tiere; Futtermittel",
  32: "Biere; Mineralwässer und kohlensäurehaltige Wässer; alkoholfreie Getränke; Fruchtgetränke und Fruchtsäfte",
  33: "Alkoholische Getränke (ausgenommen Biere)",
  34: "Tabak; Raucherartikel; Streichhölzer",
  35: "Werbung; Geschäftsführung; Unternehmensverwaltung; Büroarbeiten; Immobilienverwaltung (Dienstleistung)",
  36: "Versicherungswesen; Finanzwesen; Geldgeschäfte; Immobilienwesen",
  37: "Bauwesen; Reparaturwesen; Installationsarbeiten",
  38: "Telekommunikation",
  39: "Transportwesen; Verpackung und Lagerung von Waren; Veranstaltung von Reisen",
  40: "Materialbearbeitung",
  41: "Erziehung; Ausbildung; Unterhaltung; sportliche und kulturelle Aktivitäten",
  42: "Wissenschaftliche und technologische Dienstleistungen; Architektur; Stadtplanung; Industrielle Analyse",
  43: "Verpflegung und Beherbergung von Gästen",
  44: "Medizinische Dienstleistungen; Veterinärmedizinische Dienstleistungen; Gesundheits- und Schönheitspflege",
  45: "Juristische Dienstleistungen; Sicherheitsdienste; Persönliche und soziale Dienstleistungen",
};

/**
 * Immobilien-relevante Nizza-Klassen:
 * 35 — Immobilienverwaltung
 * 36 — Immobilienwesen / Makler / Finanzen
 * 37 — Bauwesen
 * 42 — Architektur / Stadtplanung
 */
export const IMMOBILIEN_KLASSEN = new Set([35, 36, 37, 42]);

export function getNizzaBeschreibung(klasse: number): string {
  return NIZZA_BESCHREIBUNG[klasse] ?? `Klasse ${klasse}`;
}

export function isImmobilienKlasse(klasse: number): boolean {
  return IMMOBILIEN_KLASSEN.has(klasse);
}
