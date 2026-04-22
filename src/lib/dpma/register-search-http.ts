/**
 * DPMA Register-Suche via direkter HTTP-Anfrage — kein Browser nötig.
 * Funktioniert auf Vercel wie lokal, keine externe Abhängigkeit.
 */
export interface HttpSearchOpts {
  nurDE?: boolean;
  nurInKraft?: boolean;
  klassen?: string;
  zeitraumMonate?: number;
}

export interface RawHit {
  az: string;
  name: string;
  status: string | null;
}

const BASE = "https://register.dpma.de";

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
};

/** Extrahiert alle Markentreffer (AZ + Name + Status) aus einer DPMA-Ergebnisseite */
function parseHits(html: string, seenAz: Set<string>): RawHit[] {
  const hits: RawHit[] = [];

  // Jede Zeile die einen Register-Link enthält
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // Aktenzeichen aus Link-href extrahieren
    const azMatch = row.match(/\/DPMAregister\/marke\/register\/(\d{7,14})\/DE/);
    if (!azMatch) continue;
    const az = azMatch[1];
    if (seenAz.has(az)) continue;
    seenAz.add(az);

    // Text aller <td>-Zellen extrahieren
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) cells.push(text);
    }

    // Name ist die Zelle nach der AZ-Zelle
    const azIdx = cells.findIndex((c) => c.replace(/\s/g, "") === az);
    const name = azIdx !== -1 ? (cells[azIdx + 1] ?? cells[0] ?? "") : (cells[1] ?? "");
    const status = azIdx !== -1 ? (cells[azIdx + 2] ?? null) : null;

    hits.push({ az, name: name.slice(0, 200), status: status?.slice(0, 100) ?? null });
  }

  return hits;
}

/** Sucht einen Begriff im DPMA-Register, paginiert automatisch */
export async function searchDpmaHttp(
  searchTerm: string,
  opts: HttpSearchOpts,
  seenAz: Set<string>,
  log: string[],
): Promise<{ hits: RawHit[]; diag: string }> {
  const hits: RawHit[] = [];
  let diag = "";

  try {
    // ── Schritt 1: Formularseite laden (Session-Cookie holen) ──────────────
    log.push(`→ GET DPMA-Formular für „${searchTerm}"…`);
    const initRes = await fetch(`${BASE}/DPMAregister/marke/basis`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
    const rawCookies = initRes.headers.getSetCookie?.() ?? [];
    const cookieStr = rawCookies.map((c) => c.split(";")[0]).join("; ");
    log.push(`✓ Formular geladen · Status ${initRes.status} · Cookies: ${cookieStr.slice(0, 60)}`);

    // ── Schritt 2: Formular abschicken ─────────────────────────────────────
    const params = new URLSearchParams();
    params.set("marke", searchTerm);
    params.set("klassen", opts.klassen ?? "36 37 42");
    params.set("radioAnsicht", "tabelle");
    params.set("rechercheStarten", "Recherche starten");
    if (opts.nurDE !== false) {
      params.set("demarke", "on");
    } else {
      params.set("emmarke", "on");
      params.set("irmarke", "on");
    }
    if (opts.nurInKraft !== false) {
      params.set("marke_inkraft_zeigen_chk", "on");
    }
    if (typeof opts.zeitraumMonate === "number" && opts.zeitraumMonate > 0) {
      const von = new Date();
      von.setMonth(von.getMonth() - opts.zeitraumMonate);
      params.set("bwt_DateVonId",
        `${String(von.getDate()).padStart(2, "0")}.${String(von.getMonth() + 1).padStart(2, "0")}.${von.getFullYear()}`
      );
    }

    log.push(`→ POST Suche: marke="${searchTerm}" klassen="${opts.klassen ?? "36 37 42"}"`);

    const searchRes = await fetch(`${BASE}/DPMAregister/marke/basis`, {
      method: "POST",
      headers: {
        ...HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": `${BASE}/DPMAregister/marke/basis`,
        ...(cookieStr ? { "Cookie": cookieStr } : {}),
      },
      body: params.toString(),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });

    const finalUrl = searchRes.url;
    const html = await searchRes.text();
    log.push(`✓ Antwort: Status ${searchRes.status} · URL: ${finalUrl}`);

    // Prüfen ob wir auf der richtigen Seite sind
    const noResults = /keine.*treffer|0 treffer|no.*result/i.test(html);
    const linkCount = (html.match(/\/DPMAregister\/marke\/register\/\d{7,14}\/DE/g) ?? []).length;
    const bodySnippet = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300);
    log.push(`  Inhalt-Snippet: ${bodySnippet}`);
    log.push(`  → ${noResults ? "KEIN TREFFER (Text-Match)" : linkCount + " Register-Links"}`);

    if (!noResults) {
      // ── Erste Seite ──────────────────────────────────────────────────────
      const page1 = parseHits(html, seenAz);
      hits.push(...page1);

      // ── Pagination: weitere Seiten laden ─────────────────────────────────
      let currentHtml = html;
      let currentUrl = finalUrl;
      let pageNum = 2;

      while (true) {
        // Nächste-Seite-Link suchen
        const nextMatch = currentHtml.match(/href="([^"]*(?:next|naechste|nächste|seite=\d+|page=\d+)[^"]*)"/i)
          ?? currentHtml.match(/href="([^"]*DPMAregister\/marke\/trefferliste[^"]*)">(?:&gt;&gt;|>>|weiter|nächste)/i);

        if (!nextMatch) break;

        const nextHref = nextMatch[1].replace(/&amp;/g, "&");
        const nextUrl = nextHref.startsWith("http") ? nextHref : `${BASE}${nextHref}`;
        if (nextUrl === currentUrl) break;

        log.push(`→ Seite ${pageNum}: ${nextUrl.slice(-60)}`);
        const pageRes = await fetch(nextUrl, {
          headers: { ...HEADERS, ...(cookieStr ? { "Cookie": cookieStr } : {}) },
          redirect: "follow",
          signal: AbortSignal.timeout(20_000),
        });
        currentHtml = await pageRes.text();
        currentUrl = pageRes.url;
        const pageHits = parseHits(currentHtml, seenAz);
        if (pageHits.length === 0) break;
        hits.push(...pageHits);
        pageNum++;
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    diag = `HTTP ${searchRes.status} · ${finalUrl.slice(-50)} · ${linkCount} Links · ${hits.length} AZ`;
  } catch (e) {
    diag = `FEHLER: ${(e as Error).message.slice(0, 150)}`;
    log.push(`✗ ${diag}`);
  }

  return { hits, diag };
}
