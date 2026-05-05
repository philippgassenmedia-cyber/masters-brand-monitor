import { getSupabaseAdminClient } from "../supabase/server";
import { matchAgainstStems } from "../dpma/matching";
import { classifyTrademark } from "../dpma/classifier";
import { getTopVariants } from "../dpma/variant-generator";
import { resolveCompanyProfile } from "../resolve-company";
import type { DpmaKurierHit } from "../dpma/types";

const EUIPO_SEARCH_URL = "https://euipo.europa.eu/eSearchCLPAPI/api/v1/trademark/search";

export type EuipoEvent =
  | { type: "status"; message: string }
  | { type: "browser:start" }
  | { type: "browser:loaded"; trefferCount: number }
  | { type: "browser:done"; hitCount: number }
  | { type: "analyze:start"; index: number; total: number; markenname: string }
  | { type: "analyze:done"; markenname: string; score: number | null; matchType: string }
  | { type: "hit:new"; id: string; aktenzeichen: string; markenname: string; score: number | null; website?: string | null }
  | { type: "hit:dup"; aktenzeichen: string }
  | { type: "error"; message: string }
  | { type: "done"; totalFound: number; newTrademarks: number; updated: number; errors: number };

export interface EuipoSearchOptions {
  klassen?: string;
  zeitraumMonate?: number;
  nurInKraft?: boolean;
}

/** Raw hit returned by the EUIPO API — maps 1:1 onto DpmaKurierHit for shared classify/save logic. */
export interface EuipoRawHit {
  applicationNumber: string;
  trademarkName: string;
  trademarkStatus: string | null;
  applicantName: string | null;
  applicantAddress: string | null;
  niceClasses: number[];
  applicationDate: string | null;  // "YYYYMMDD" or ISO
  publicationDate: string | null;
  expiryDate: string | null;
  goodsAndServices: string | null;
  representative: string | null;
  trademarkType: string | null;
}

// ── EUIPO REST API ────────────────────────────────────────────────────────────

function parseEuipoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // "20200115" → "2020-01-15"
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

async function searchEuipoPage(
  searchTerm: string,
  opts: EuipoSearchOptions,
  page: number,
  seenAz: Set<string>,
): Promise<{ hits: EuipoRawHit[]; total: number }> {
  const params = new URLSearchParams({
    basicSearch: "yes",
    searchTerms: searchTerm,
    language: "en",
    page: String(page),
    pageSize: "100",
  });

  if (opts.nurInKraft) {
    params.set("trademarkStatus", "Registered,Filed,Published");
  }

  if (opts.klassen) {
    const classList = opts.klassen.trim().replace(/\s+/g, ",");
    params.set("niceClasses", classList);
  }

  if (opts.zeitraumMonate) {
    const from = new Date();
    from.setMonth(from.getMonth() - opts.zeitraumMonate);
    const yyyymmdd = from.toISOString().slice(0, 10).replace(/-/g, "");
    params.set("applicationDateFrom", yyyymmdd);
  }

  const r = await fetch(`${EUIPO_SEARCH_URL}?${params}`, {
    headers: { Accept: "application/json", "User-Agent": "BrandMonitor/1.0" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`EUIPO API HTTP ${r.status}: ${text.slice(0, 200)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await r.json();
  const total: number = data.totalResults ?? data.total ?? 0;
  const rawList: unknown[] = data.trademarks ?? data.results ?? data.items ?? [];

  const hits: EuipoRawHit[] = [];
  for (const tm of rawList) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tm as any;
    const az: string =
      t.applicationNumber ?? t.appNumber ?? t.id ?? t.applicationId ?? "";
    if (!az || seenAz.has(az)) continue;
    seenAz.add(az);

    const applicants: Array<{ name?: string; address?: string }> =
      t.applicants ?? t.holders ?? t.applicant ? [t.applicant] : [];
    const firstApplicant = Array.isArray(applicants) ? applicants[0] : null;

    hits.push({
      applicationNumber: az,
      trademarkName: t.trademarkName ?? t.markName ?? t.name ?? `[EUTM ${az}]`,
      trademarkStatus: t.trademarkStatus ?? t.status ?? null,
      applicantName: firstApplicant?.name ?? t.applicantName ?? null,
      applicantAddress: firstApplicant?.address ?? t.applicantAddress ?? null,
      niceClasses: Array.isArray(t.niceClasses)
        ? (t.niceClasses as number[]).filter((n) => n > 0 && n <= 45)
        : [],
      applicationDate: parseEuipoDate(t.applicationDate ?? t.filingDate ?? null),
      publicationDate: parseEuipoDate(t.publicationDate ?? t.publishDate ?? null),
      expiryDate: parseEuipoDate(t.expiryDate ?? t.renewalDate ?? null),
      goodsAndServices: t.goodsAndServices ?? t.goodsServices ?? t.specification ?? null,
      representative: typeof t.representative === "string"
        ? t.representative
        : (t.representative?.name ?? null),
      trademarkType: t.trademarkType ?? t.markType ?? null,
    });
  }

  return { hits, total };
}

async function searchEuipoAll(
  searchTerm: string,
  opts: EuipoSearchOptions,
  seenAz: Set<string>,
): Promise<EuipoRawHit[]> {
  const { hits: page1, total } = await searchEuipoPage(searchTerm, opts, 1, seenAz);
  if (total <= 100) return page1;

  const allHits = [...page1];
  const pages = Math.min(Math.ceil(total / 100), 5); // max 500 per variant
  for (let p = 2; p <= pages; p++) {
    const { hits } = await searchEuipoPage(searchTerm, opts, p, seenAz);
    allHits.push(...hits);
  }
  return allHits;
}

// ── Classify & Save ───────────────────────────────────────────────────────────

function rawHitToDpmaHit(h: EuipoRawHit): DpmaKurierHit {
  return {
    aktenzeichen: h.applicationNumber,
    markenname: h.trademarkName,
    anmelder: h.applicantName,
    anmeldetag: h.applicationDate,
    veroeffentlichungstag: h.publicationDate,
    status: h.trademarkStatus,
    nizza_klassen: h.niceClasses,
    waren_dienstleistungen: h.goodsAndServices,
    inhaber_anschrift: h.applicantAddress,
    vertreter: h.representative,
    markenform: h.trademarkType,
    schutzdauer_bis: h.expiryDate,
  };
}

async function* classifyAndSave(
  hits: EuipoRawHit[],
  stems: string[],
): AsyncGenerator<EuipoEvent> {
  const db = getSupabaseAdminClient();

  for (let i = 0; i < hits.length; i++) {
    const raw = hits[i];
    const hit = rawHitToDpmaHit(raw);
    yield { type: "analyze:start", index: i + 1, total: hits.length, markenname: hit.markenname };

    try {
      const match = matchAgainstStems(hit.markenname, stems);

      const { data: existing } = await db
        .from("trademarks")
        .select("id")
        .eq("aktenzeichen", hit.aktenzeichen)
        .eq("markenstamm", match.stem)
        .maybeSingle();

      if (existing) {
        await db
          .from("trademarks")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);
        yield { type: "hit:dup", aktenzeichen: hit.aktenzeichen };
        continue;
      }

      await new Promise((r) => setTimeout(r, 1500));
      const classification = await classifyTrademark(hit, match);

      const fristEnde = hit.schutzdauer_bis ?? (hit.veroeffentlichungstag
        ? (() => {
            const d = new Date(hit.veroeffentlichungstag!);
            if (isNaN(d.getTime())) return null;
            d.setMonth(d.getMonth() + 3);
            return d.toISOString().slice(0, 10);
          })()
        : null);

      let resolvedWebsite: string | null = null;
      if (classification.score >= 5 || match.type === "exact" || match.type === "compound") {
        try {
          const searchName = hit.markenname + (hit.anmelder ? ` ${hit.anmelder}` : "");
          yield { type: "status", message: `Website suchen: ${searchName.slice(0, 50)}…` };
          const { resolvedUrl, profile: webProfile } = await resolveCompanyProfile(searchName);
          resolvedWebsite = resolvedUrl;
          if (webProfile?.company_name && !hit.anmelder) {
            hit.anmelder = webProfile.company_name as string;
          }
        } catch {
          // optional
        }
      }

      const { data: inserted } = await db
        .from("trademarks")
        .insert({
          aktenzeichen: hit.aktenzeichen,
          markenname: hit.markenname,
          anmelder: hit.anmelder,
          anmeldetag: hit.anmeldetag,
          veroeffentlichungstag: hit.veroeffentlichungstag,
          widerspruchsfrist_ende: fristEnde,
          status: hit.status,
          nizza_klassen: hit.nizza_klassen,
          waren_dienstleistungen: hit.waren_dienstleistungen,
          inhaber_anschrift: hit.inhaber_anschrift,
          vertreter: hit.vertreter,
          markenform: hit.markenform,
          schutzdauer_bis: hit.schutzdauer_bis,
          quelle: "euipo",
          match_type: match.type,
          markenstamm: match.stem,
          register_url: `https://euipo.europa.eu/eSearch/#details/trademarks/${hit.aktenzeichen}`,
          relevance_score: classification.score,
          branchenbezug: classification.branchenbezug,
          prioritaet: classification.prioritaet,
          begruendung: classification.begruendung,
          resolved_website: resolvedWebsite,
        })
        .select("id")
        .single();

      yield {
        type: "hit:new",
        id: inserted?.id ?? "",
        aktenzeichen: hit.aktenzeichen,
        markenname: hit.markenname,
        score: classification.score,
        website: resolvedWebsite,
      };
      yield { type: "analyze:done", markenname: hit.markenname, score: classification.score, matchType: match.type };
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("duplicate") && !msg.includes("unique")) {
        yield { type: "error", message: `${raw.applicationNumber}: ${msg.slice(0, 150)}` };
      }
    }
  }
}

// ── Public exports ────────────────────────────────────────────────────────────

/** Für /api/euipo/classify — klassifiziert bereits gesammelte Hits, streamt Events + done. */
export async function* runEuipoClassify(
  hits: EuipoRawHit[],
  stems: string[],
): AsyncGenerator<EuipoEvent> {
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  yield { type: "browser:done", hitCount: hits.length };
  yield { type: "status", message: `Starte Analyse von ${hits.length} EUIPO-Treffern…` };

  for await (const ev of classifyAndSave(hits, stems)) {
    if (ev.type === "hit:new") newTrademarks++;
    else if (ev.type === "hit:dup") updated++;
    else if (ev.type === "error") errorCount++;
    yield ev;
  }

  yield { type: "done", totalFound: hits.length, newTrademarks, updated, errors: errorCount };
}

/** Vollständiger EUIPO-Scan: API-Suche pro Cluster → sofort klassifizieren & speichern. */
export async function* runEuipoSearchStream(
  stems: string[],
  opts: EuipoSearchOptions = {},
): AsyncGenerator<EuipoEvent> {
  let totalFound = 0;
  let newTrademarks = 0;
  let updated = 0;
  let errorCount = 0;

  yield { type: "status", message: "Initialisiere EUIPO REST-API-Suche…" };

  for (const stem of stems) {
    const variants = getTopVariants(stem, 6);
    yield { type: "status", message: `Cluster „${stem}": ${variants.length} Varianten → EUIPO API…` };

    try {
      const seenAz = new Set<string>();
      const stemHits: EuipoRawHit[] = [];

      for (const variant of variants) {
        yield { type: "status", message: `EUIPO: suche „${variant}"…` };
        try {
          const hits = await searchEuipoAll(variant, opts, seenAz);
          stemHits.push(...hits);
          yield { type: "status", message: `„${variant}": ${hits.length} Treffer (gesamt: ${stemHits.length})` };
        } catch (e) {
          yield { type: "error", message: `Suche „${variant}": ${(e as Error).message.slice(0, 150)}` };
        }
      }

      totalFound += stemHits.length;
      yield { type: "browser:loaded", trefferCount: stemHits.length };

      if (stemHits.length === 0) {
        yield { type: "status", message: `Cluster „${stem}": keine Treffer` };
        continue;
      }

      yield { type: "status", message: `Cluster „${stem}": ${stemHits.length} Treffer → Analyse & Speicherung…` };

      for await (const ev of classifyAndSave(stemHits, stems)) {
        if (ev.type === "hit:new") newTrademarks++;
        else if (ev.type === "hit:dup") updated++;
        else if (ev.type === "error") errorCount++;
        yield ev;
      }

      yield { type: "status", message: `✓ Cluster „${stem}" gespeichert — ${stemHits.length} verarbeitet` };
    } catch (e) {
      errorCount++;
      yield { type: "error", message: `EUIPO „${stem}": ${(e as Error).message.slice(0, 200)}` };
    }
  }

  yield { type: "browser:done", hitCount: totalFound };
  yield { type: "done", totalFound, newTrademarks, updated, errors: errorCount };
}
