import { distance } from "fastest-levenshtein";
import { colognePhonetics } from "./phonetics";
import type { TrademarkMatchType } from "./types";

export interface MatchResult {
  type: TrademarkMatchType;
  stem: string;
  details: string;
}

/**
 * Prüft einen Markennamen gegen eine Liste von Markenstämmen.
 * Versucht in absteigender Spezifität: exact → compound → fuzzy → phonetic → class_only
 */
export function matchAgainstStems(
  markenname: string,
  stems: string[],
): MatchResult {
  const nameLower = markenname.toLowerCase().trim();

  for (const stem of stems) {
    const stemLower = stem.toLowerCase().trim();

    // 1. Exakter Match: Markenname entspricht exakt dem Stamm
    if (nameLower === stemLower) {
      return {
        type: "exact",
        stem,
        details: `Exakter Treffer: "${markenname}" = "${stem}"`,
      };
    }
  }

  for (const stem of stems) {
    const stemLower = stem.toLowerCase().trim();

    // 2. Compound-Match: Stamm ist Bestandteil des Markennamens
    //    z.B. "MasterGround" enthält "Master"
    if (
      nameLower.includes(stemLower) &&
      nameLower !== stemLower &&
      stemLower.length >= 3
    ) {
      return {
        type: "compound",
        stem,
        details: `Zusammensetzung: "${markenname}" enthält "${stem}"`,
      };
    }
  }

  for (const stem of stems) {
    const stemLower = stem.toLowerCase().trim();

    // 3. Fuzzy-Match: Levenshtein-Distanz ≤ 2
    const dist = distance(nameLower, stemLower);
    if (dist <= 2 && dist > 0) {
      return {
        type: "fuzzy",
        stem,
        details: `Fuzzy-Treffer: "${markenname}" ↔ "${stem}" (Distanz ${dist})`,
      };
    }

    // Fuzzy auch auf Teilstrings versuchen (für zusammengesetzte Markennamen)
    const words = nameLower.split(/[\s\-]+/);
    for (const word of words) {
      const wordDist = distance(word, stemLower);
      if (wordDist <= 2 && wordDist > 0 && word.length >= 3) {
        return {
          type: "fuzzy",
          stem,
          details: `Fuzzy-Treffer auf Wort: "${word}" ↔ "${stem}" (Distanz ${wordDist})`,
        };
      }
    }
  }

  for (const stem of stems) {
    // 4. Phonetischer Match: Kölner Phonetik
    const namePhon = colognePhonetics(markenname);
    const stemPhon = colognePhonetics(stem);

    if (namePhon && stemPhon && namePhon === stemPhon) {
      return {
        type: "phonetic",
        stem,
        details: `Phonetischer Treffer: "${markenname}" [${namePhon}] = "${stem}" [${stemPhon}]`,
      };
    }

    // Phonetik auch auf Teilstrings
    const words = markenname.split(/[\s\-]+/);
    for (const word of words) {
      const wordPhon = colognePhonetics(word);
      if (wordPhon && stemPhon && wordPhon === stemPhon && word.length >= 3) {
        return {
          type: "phonetic",
          stem,
          details: `Phonetischer Treffer auf Wort: "${word}" [${wordPhon}] = "${stem}" [${stemPhon}]`,
        };
      }
    }
  }

  // 5. Fallback: class_only — kein Name-Match, nur Klassenzugehörigkeit
  return {
    type: "class_only",
    stem: stems[0] ?? "",
    details: "Kein Name-Match. Treffer nur durch Nizza-Klassenzugehörigkeit.",
  };
}
