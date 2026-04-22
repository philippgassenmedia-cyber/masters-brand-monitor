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
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
};

/** Extrahiert Set-Cookie-Header-Werte browserübergreifend */
function extractCookies(res: Response): string[] {
  // getSetCookie() ist Node 18+; Fallback auf get("set-cookie")
  if (typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function") {
    return (res.headers as { getSetCookie: () => string[] }).getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

/** Zusammenführt alte und neue Cookies (neue überschreiben alte) */
function mergeCookies(existing: Record<string, string>, newCookies: string[]): Record<string, string> {
  const merged = { ...existing };
  for (const cookie of newCookies) {
    const pair = cookie.split(";")[0].trim();
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    merged[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
  }
  return merged;
}

function cookieJarToHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Extrahiert alle hidden-input-Felder aus einem HTML-Formular */
function extractHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const re = /<input[^>]+type=["']?hidden["']?[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const nameM = tag.match(/name=["']([^"']+)["']/i);
    const valueM = tag.match(/value=["']([^"']*)["']/i);
    if (nameM) fields[nameM[1]] = valueM ? valueM[1] : "";
  }
  return fields;
}

/** Folgt einem Redirect manuell und leitet Cookies weiter */
async function fetchFollowRedirects(
  url: string,
  init: RequestInit,
  cookieJar: Record<string, string>,
  log: string[],
  timeoutMs = 25_000,
  maxRedirects = 8,
): Promise<{ res: Response; html: string; cookieJar: Record<string, string> }> {
  let currentUrl = url;
  let currentInit = { ...init };
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const cookieHeader = cookieJarToHeader(cookieJar);
    const headers: Record<string, string> = {
      ...HEADERS,
      ...(currentInit.headers as Record<string, string> ?? {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
    const res = await fetch(currentUrl, {
      ...currentInit,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Neue Cookies mergen
    cookieJar = mergeCookies(cookieJar, extractCookies(res));

    const location = res.headers.get("location");
    if ((res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308) && location) {
      const nextUrl = location.startsWith("http") ? location : `${BASE}${location}`;
      log.push(`  ↳ Redirect ${res.status} → ${nextUrl.slice(-80)}`);
      currentUrl = nextUrl;
      // Nach POST-Redirect → GET
      if (res.status === 301 || res.status === 302 || res.status === 303) {
        currentInit = { method: "GET" };
      }
      redirectCount++;
      continue;
    }

    const html = await res.text();
    return { res, html, cookieJar };
  }

  throw new Error("Zu viele Redirects");
}

/** Extrahiert alle Markentreffer (AZ + Name + Status) aus einer DPMA-Ergebnisseite */
function parseHits(html: string, seenAz: Set<string>): RawHit[] {
  const hits: RawHit[] = [];

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
    // ── Schritt 1: Formularseite laden — Session-Cookie + versteckte Felder ──
    log.push(`→ GET DPMA-Formular für „${searchTerm}"…`);
    const initRes = await fetch(`${BASE}/DPMAregister/marke/basis`, {
      headers: HEADERS,
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    let cookieJar = mergeCookies({}, extractCookies(initRes));

    // Falls sofort Redirect (z.B. auf https)
    let formHtml = "";
    if (initRes.status >= 300 && initRes.status < 400) {
      const loc = initRes.headers.get("location") ?? `${BASE}/DPMAregister/marke/basis`;
      const redirectRes = await fetch(loc.startsWith("http") ? loc : `${BASE}${loc}`, {
        headers: { ...HEADERS, Cookie: cookieJarToHeader(cookieJar) },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      cookieJar = mergeCookies(cookieJar, extractCookies(redirectRes));
      formHtml = await redirectRes.text();
    } else {
      formHtml = await initRes.text();
    }

    const cookieHeader = cookieJarToHeader(cookieJar);
    log.push(`✓ Formular geladen · Status ${initRes.status} · Cookies: ${cookieHeader.slice(0, 80)}`);

    // Versteckte Felder aus dem Formular lesen (JSF ViewState etc.)
    const hiddenFields = extractHiddenFields(formHtml);
    const hiddenKeys = Object.keys(hiddenFields);
    log.push(`  Hidden inputs: ${hiddenKeys.length > 0 ? hiddenKeys.join(", ") : "(keine)"}`);

    // ── Schritt 2: Formular abschicken ────────────────────────────────────────
    const params = new URLSearchParams();

    // Zuerst alle Hidden-Felder übernehmen
    for (const [k, v] of Object.entries(hiddenFields)) {
      params.set(k, v);
    }

    // Dann sichtbare Felder setzen (überschreiben ggf. gleichnamige hidden)
    params.set("marke", searchTerm);
    params.set("klassen", opts.klassen ?? "36 37 42");
    params.set("radioAnsicht", "tabelle");
    params.set("rechercheStarten", "Recherche starten");
    if (opts.nurDE !== false) {
      params.set("demarke", "on");
      params.delete("emmarke");
      params.delete("irmarke");
    } else {
      params.delete("demarke");
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

    log.push(`→ POST Suche: marke="${searchTerm}" klassen="${opts.klassen ?? "36 37 42"}" body-len=${params.toString().length}`);

    const { res: searchRes, html, cookieJar: updatedJar } = await fetchFollowRedirects(
      `${BASE}/DPMAregister/marke/basis`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": `${BASE}/DPMAregister/marke/basis`,
          "Origin": BASE,
        },
        body: params.toString(),
      },
      cookieJar,
      log,
      30_000,
    );
    cookieJar = updatedJar;

    const finalUrl = searchRes.url || `${BASE}/DPMAregister/marke/basis`;
    log.push(`✓ Antwort: Status ${searchRes.status} · URL: ${finalUrl.slice(-80)}`);

    const noResults = /keine.*treffer|0 treffer|no.*result/i.test(html);
    const linkCount = (html.match(/\/DPMAregister\/marke\/register\/\d{7,14}\/DE/g) ?? []).length;
    const bodySnippet = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400);
    log.push(`  Snippet: ${bodySnippet}`);
    log.push(`  → ${noResults ? "KEIN TREFFER (Text-Match)" : linkCount + " Register-Links"}`);

    if (!noResults && linkCount > 0) {
      // ── Erste Seite ──────────────────────────────────────────────────────
      hits.push(...parseHits(html, seenAz));

      // ── Pagination ────────────────────────────────────────────────────────
      let currentHtml = html;
      let currentUrl = finalUrl;
      let pageNum = 2;

      while (true) {
        const nextMatch =
          currentHtml.match(/href="([^"]*(?:naechste|nächste|seite=\d+|page=\d+)[^"]*)"/i) ??
          currentHtml.match(/href="([^"]*DPMAregister\/marke\/trefferliste[^"]*)">(?:&gt;&gt;|>>|weiter)/i);

        if (!nextMatch) break;

        const nextHref = nextMatch[1].replace(/&amp;/g, "&");
        const nextUrl = nextHref.startsWith("http") ? nextHref : `${BASE}${nextHref}`;
        if (nextUrl === currentUrl) break;

        log.push(`→ Seite ${pageNum}: ${nextUrl.slice(-60)}`);
        const { html: pageHtml, cookieJar: pageJar } = await fetchFollowRedirects(
          nextUrl, { method: "GET" }, cookieJar, log, 20_000,
        );
        cookieJar = pageJar;
        currentHtml = pageHtml;
        currentUrl = nextUrl;
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
