import { distance } from "fastest-levenshtein";
import { colognePhonetics } from "./phonetics";
import type { TrademarkMatchType } from "./types";

export interface MatchResult {
  type: TrademarkMatchType;
  stem: string;
  details: string;
}

// Wörter die "master" enthalten aber NICHT relevant sind
const COMPOUND_BLACKLIST = new Set([
  "webmaster", "postmaster", "mastercard", "masterclass", "masterplan",
  "grandmaster", "headmaster", "taskmaster", "scoutmaster", "choirmaster",
  "quizmaster", "masterwork", "mastermind", "masterstudy", "masterstudium",
  "masterarbeit", "masterthesis", "toastmaster", "gamemaster", "dungeon",
  "masterfile", "masterdata", "masterkey", "masternode", "masterslave",
  "remaster", "burgmaster", "lockmaster", "yardmaster", "ringmaster",
]);

/**
 * Prüft einen Markennamen gegen eine Liste von Markenstämmen.
 * Versucht in absteigender Spezifität: exact → compound → fuzzy → phonetic → class_only
 */
export function matchAgainstStems(
  markenname: string,
  stems: string[],
): MatchResult {
  const nameLower = markenname.toLowerCase().trim();
  // Einzelwörter für Teilstring-Matching
  const nameWords = nameLower.split(/[\s\-_.]+/).filter(w => w.length >= 3);

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
    // Auch exakt wenn ein einzelnes Wort exakt matcht
    if (nameWords.some(w => w === stemLower) && nameWords.length > 1) {
      return {
        type: "exact",
        stem,
        details: `Exaktes Wort: "${stem}" in "${markenname}"`,
      };
    }
  }

  for (const stem of stems) {
    const stemLower = stem.toLowerCase().trim();

    // 2. Compound-Match: Stamm ist am ANFANG des Markennamens
    //    "MasterGround" ✓, "Webmaster" ✗
    if (
      nameLower.startsWith(stemLower) &&
      nameLower !== stemLower &&
      stemLower.length >= 3 &&
      !COMPOUND_BLACKLIST.has(nameLower)
    ) {
      return {
        type: "compound",
        stem,
        details: `Zusammensetzung: "${markenname}" beginnt mit "${stem}"`,
      };
    }

    // Auch wenn ein Wort mit dem Stamm beginnt (z.B. "Die Master-Gruppe")
    for (const word of nameWords) {
      if (
        word.startsWith(stemLower) &&
        word !== stemLower &&
        !COMPOUND_BLACKLIST.has(word)
      ) {
        return {
          type: "compound",
          stem,
          details: `Zusammensetzung: Wort "${word}" beginnt mit "${stem}" in "${markenname}"`,
        };
      }
    }
  }

  for (const stem of stems) {
    const stemLower = stem.toLowerCase().trim();

    // 3. Fuzzy-Match: Levenshtein-Distanz ≤ 1 (strenger als vorher)
    //    Bei kurzen Wörtern (≤6 Zeichen) ist Distanz 2 schon 33% — zu viel
    const maxDist = stemLower.length <= 5 ? 1 : 2;
    const dist = distance(nameLower, stemLower);
    if (dist <= maxDist && dist > 0) {
      return {
        type: "fuzzy",
        stem,
        details: `Fuzzy-Treffer: "${markenname}" ↔ "${stem}" (Distanz ${dist})`,
      };
    }

    // Fuzzy auf Einzelwörter
    for (const word of nameWords) {
      const wordMaxDist = Math.min(word.length, stemLower.length) <= 5 ? 1 : 2;
      const wordDist = distance(word, stemLower);
      if (wordDist <= wordMaxDist && wordDist > 0) {
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
    const stemPhon = colognePhonetics(stem);
    if (!stemPhon) continue;

    const namePhon = colognePhonetics(markenname);
    if (namePhon && namePhon === stemPhon) {
      return {
        type: "phonetic",
        stem,
        details: `Phonetischer Treffer: "${markenname}" [${namePhon}] = "${stem}" [${stemPhon}]`,
      };
    }

    // Phonetik auf Einzelwörter
    for (const word of nameWords) {
      const wordPhon = colognePhonetics(word);
      if (wordPhon && wordPhon === stemPhon) {
        return {
          type: "phonetic",
          stem,
          details: `Phonetischer Treffer auf Wort: "${word}" [${wordPhon}] = "${stem}" [${stemPhon}]`,
        };
      }
    }
  }

  // 5. Fallback: class_only
  return {
    type: "class_only",
    stem: stems[0] ?? "",
    details: "Kein Name-Match. Treffer nur durch Nizza-Klassenzugehörigkeit.",
  };
}
