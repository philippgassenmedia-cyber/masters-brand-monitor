// Kölner Phonetik — deutsches phonetisches Encoding, ähnlich wie Soundex aber
// optimiert für deutsche Aussprache. Wird für phonetischen Marken-Vergleich verwendet.

export function colognePhonetics(input: string): string {
  if (!input) return "";

  const s = input
    .toUpperCase()
    .replace(/[^A-ZÄÖÜ]/g, "")
    .replace(/Ä/g, "A")
    .replace(/Ö/g, "O")
    .replace(/Ü/g, "U");

  if (!s) return "";

  const codes: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const prev = i > 0 ? s[i - 1] : "";
    const next = i < s.length - 1 ? s[i + 1] : "";

    let code: string;

    switch (c) {
      case "A":
      case "E":
      case "I":
      case "O":
      case "U":
        code = "0";
        break;
      case "H":
        code = "";
        break;
      case "B":
      case "P":
        code = "1";
        break;
      case "D":
      case "T":
        if ("CSZ".includes(next)) {
          code = "8";
        } else {
          code = "2";
        }
        break;
      case "F":
      case "V":
      case "W":
        code = "3";
        break;
      case "G":
      case "K":
      case "Q":
        code = "4";
        break;
      case "C":
        if (i === 0) {
          code = "AHKLOQRUX".includes(next) ? "4" : "8";
        } else if ("SZ".includes(prev)) {
          code = "8";
        } else if ("AHKOQUX".includes(next)) {
          code = "4";
        } else {
          code = "8";
        }
        break;
      case "X":
        if ("CKQ".includes(prev)) {
          code = "8";
        } else {
          code = "48";
        }
        break;
      case "L":
        code = "5";
        break;
      case "M":
      case "N":
        code = "6";
        break;
      case "R":
        code = "7";
        break;
      case "S":
      case "Z":
        code = "8";
        break;
      case "J":
        code = "0";
        break;
      default:
        code = "";
    }

    codes.push(code);
  }

  // Doppelte aufeinanderfolgende Codes entfernen
  let result = codes[0] ?? "";
  for (let i = 1; i < codes.length; i++) {
    if (codes[i] && codes[i] !== codes[i - 1]) {
      result += codes[i];
    }
  }

  // Führende Null behalten, aber innere Nullen entfernen
  if (result.length > 1) {
    result = result[0] + result.slice(1).replace(/0/g, "");
  }

  return result;
}
