export interface ScanCity {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
}

export const SCAN_CITIES: ScanCity[] = [
  { id: "berlin", name: "Berlin", state: "Berlin", lat: 52.52, lon: 13.405 },
  { id: "hamburg", name: "Hamburg", state: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { id: "muenchen", name: "München", state: "Bayern", lat: 48.1371, lon: 11.5754 },
  { id: "koeln", name: "Köln", state: "Nordrhein-Westfalen", lat: 50.9375, lon: 6.9603 },
  { id: "frankfurt", name: "Frankfurt am Main", state: "Hessen", lat: 50.1109, lon: 8.6821 },
  { id: "stuttgart", name: "Stuttgart", state: "Baden-Württemberg", lat: 48.7758, lon: 9.1829 },
  { id: "duesseldorf", name: "Düsseldorf", state: "Nordrhein-Westfalen", lat: 51.2277, lon: 6.7735 },
  { id: "leipzig", name: "Leipzig", state: "Sachsen", lat: 51.3397, lon: 12.3731 },
  { id: "dortmund", name: "Dortmund", state: "Nordrhein-Westfalen", lat: 51.5136, lon: 7.4653 },
  { id: "essen", name: "Essen", state: "Nordrhein-Westfalen", lat: 51.4556, lon: 7.0116 },
  { id: "bremen", name: "Bremen", state: "Bremen", lat: 53.0793, lon: 8.8017 },
  { id: "dresden", name: "Dresden", state: "Sachsen", lat: 51.0504, lon: 13.7373 },
  { id: "hannover", name: "Hannover", state: "Niedersachsen", lat: 52.3759, lon: 9.732 },
  { id: "nuernberg", name: "Nürnberg", state: "Bayern", lat: 49.4521, lon: 11.0767 },
  { id: "wiesbaden", name: "Wiesbaden", state: "Hessen", lat: 50.0782, lon: 8.2398 },
  { id: "mannheim", name: "Mannheim", state: "Baden-Württemberg", lat: 49.4875, lon: 8.466 },
  { id: "karlsruhe", name: "Karlsruhe", state: "Baden-Württemberg", lat: 49.0069, lon: 8.4037 },
  { id: "kiel", name: "Kiel", state: "Schleswig-Holstein", lat: 54.3233, lon: 10.1228 },
  { id: "rostock", name: "Rostock", state: "Mecklenburg-Vorpommern", lat: 54.0887, lon: 12.1403 },
  { id: "saarbruecken", name: "Saarbrücken", state: "Saarland", lat: 49.2402, lon: 6.9969 },
  { id: "erfurt", name: "Erfurt", state: "Thüringen", lat: 50.9848, lon: 11.0299 },
  { id: "magdeburg", name: "Magdeburg", state: "Sachsen-Anhalt", lat: 52.1205, lon: 11.6276 },
  { id: "potsdam", name: "Potsdam", state: "Brandenburg", lat: 52.3906, lon: 13.0645 },
  { id: "mainz", name: "Mainz", state: "Rheinland-Pfalz", lat: 49.9929, lon: 8.2473 },
];
