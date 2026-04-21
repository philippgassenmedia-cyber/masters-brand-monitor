// Generiert phonetische und typographische Varianten eines Markenstamms,
// damit auch ähnliche Schreibweisen im DPMAregister gefunden werden.

// Deutsche Buchstaben-Verwechslungen (phonetisch ähnlich)
const SUBSTITUTIONS: Array<[string, string[]]> = [
  ["m", ["n"]],           // Master → Naster
  ["n", ["m"]],           // Naster → Master
  ["a", ["e", "o"]],      // Master → Mester, Moster
  ["e", ["a", "i"]],      // Mester → Master, Mister
  ["i", ["e", "y"]],      // Mister → Mester, Myster
  ["o", ["a", "u"]],      // Mostor → Mastor
  ["u", ["o"]],
  ["s", ["z", "ss"]],     // Master → Mazter, Masster
  ["z", ["s", "ts"]],
  ["t", ["d", "tt"]],     // Master → Masder, Mastter
  ["d", ["t"]],
  ["k", ["c", "ck"]],
  ["c", ["k"]],
  ["b", ["p"]],
  ["p", ["b"]],
  ["f", ["v", "ph"]],
  ["v", ["f", "w"]],
  ["w", ["v"]],
  ["ei", ["ai", "ey", "ay"]],  // Meister → Maister
  ["ai", ["ei"]],
  ["sch", ["sh", "ch"]],
  ["ch", ["sch"]],
  ["st", ["sst"]],
  ["ss", ["s", "ß"]],
  ["ß", ["ss", "s"]],
];

export function generateSearchVariants(stem: string): string[] {
  const variants = new Set<string>();
  variants.add(stem); // Original immer dabei

  const lower = stem.toLowerCase();

  // 1. Einzelbuchstaben-Substitutionen
  for (const [from, tos] of SUBSTITUTIONS) {
    let pos = 0;
    while (true) {
      const idx = lower.indexOf(from, pos);
      if (idx === -1) break;
      for (const to of tos) {
        const variant = lower.slice(0, idx) + to + lower.slice(idx + from.length);
        // Nur Varianten mit Levenshtein ≤ 2 behalten
        if (Math.abs(variant.length - lower.length) <= 2) {
          variants.add(variant);
        }
      }
      pos = idx + 1;
    }
  }

  // 2. Buchstaben-Vertauschungen (adjacent swap)
  for (let i = 0; i < lower.length - 1; i++) {
    const swapped = lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2);
    variants.add(swapped);
  }

  // 3. Buchstabe weglassen
  for (let i = 0; i < lower.length; i++) {
    const deleted = lower.slice(0, i) + lower.slice(i + 1);
    if (deleted.length >= 3) variants.add(deleted);
  }

  // 4. Buchstabe verdoppeln
  for (let i = 0; i < lower.length; i++) {
    const doubled = lower.slice(0, i) + lower[i] + lower.slice(i);
    variants.add(doubled);
  }

  // Wildcard-Suchen für DPMA (Stern am Ende für Compound-Matches)
  const result = [...variants].map((v) => v.charAt(0).toUpperCase() + v.slice(1));

  return result;
}

// Gibt die wichtigsten Varianten zurück (max N), sortiert nach Wahrscheinlichkeit
export function getTopVariants(stem: string, max = 10): string[] {
  const all = generateSearchVariants(stem);
  // Original + phonetisch häufigste zuerst
  const prioritized = [
    stem, // Original
    ...all.filter((v) => v.toLowerCase() !== stem.toLowerCase()),
  ];
  return [...new Set(prioritized)].slice(0, max);
}
