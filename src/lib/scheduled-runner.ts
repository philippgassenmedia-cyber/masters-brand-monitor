import { getSupabaseAdminClient } from "./supabase/server";
import { sendScanReport } from "./email-service";

// Dynamische Imports um zirkuläre Dependencies zu vermeiden
async function runWebDeepScan(): Promise<Record<string, unknown>> {
  const mod = await import("@/app/api/cron/weekly-scan/route");
  // Die runDeepScan Funktion ist nicht exportiert, also simulieren wir den Cron-Call intern
  const { searchWeb } = await import("./search");
  const { analyzeHitWithGemini } = await import("./gemini");
  const { scrapeImpressum } = await import("./impressum-scraper");
  const { loadExcludedDomains, isExcluded, BRAND_NAME } = await import("./brand");
  const { isOwnerCompany } = await import("./brand");
  const { extractCompanyFromText } = await import("./profile-cleanup");
  const { isAggregatorDomain, resolveCompanyProfile } = await import("./resolve-company");

  const db = getSupabaseAdminClient();
  const excluded = await loadExcludedDomains();

  const queries = [
    `"${BRAND_NAME}" Immobilien Makler`,
    `"${BRAND_NAME}" Hausverwaltung`,
    `"${BRAND_NAME}" Immobilien GmbH`,
    `"${BRAND_NAME}" Unternehmensberatung`,
    `"${BRAND_NAME}" Consulting`,
    `"${BRAND_NAME}" Beratung GmbH`,
    `"${BRAND_NAME}" Property Management`,
    `"${BRAND_NAME}" Real Estate`,
    `"${BRAND_NAME}" Bauträger`,
    `"${BRAND_NAME}" Immobilienberatung`,
    `"${BRAND_NAME}" Investment`,
    `"${BRAND_NAME}" Facility Management`,
  ];

  let rawResults = 0;
  let newHits = 0;
  let errors = 0;

  for (const q of queries) {
    try {
      const results = await searchWeb(q, "deutschland");
      rawResults += results.length;
      for (const r of results) {
        if (isExcluded(r.url, excluded)) continue;
        const { data: existing } = await db.from("hits").select("id").eq("url", r.url).maybeSingle();
        if (existing) continue;
        try {
          const domain = new URL(r.url).hostname.replace(/^www\./, "");
          const profile = isAggregatorDomain(domain) ? null : await scrapeImpressum(r.url).catch(() => null);
          const analysis = await analyzeHitWithGemini({ raw: r, profile });
          const company = analysis.subject_company ?? profile?.company_name ?? extractCompanyFromText(analysis.reasoning) ?? null;
          if (isOwnerCompany(company)) continue;
          await db.from("hits").insert({
            url: r.url, domain, title: r.title, snippet: r.snippet,
            company_name: company, ai_score: analysis.score, ai_is_violation: analysis.is_violation,
            ai_reasoning: analysis.reasoning, ai_recommendation: analysis.recommendation,
            ai_model: analysis.model, ai_analyzed_at: new Date().toISOString(),
            violation_category: analysis.violation_category,
          });
          newHits++;
        } catch { errors++; }
      }
    } catch { errors++; }
  }

  return { queries: queries.length, rawResults, newHits, errors };
}

async function runDpmaScan(): Promise<unknown> {
  const { searchDpmaRegister } = await import("./dpma/register-search");
  const db = getSupabaseAdminClient();
  const { data: stemsData } = await db.from("brand_stems").select("stamm").eq("aktiv", true);
  const stems = (stemsData ?? []).map((s) => s.stamm as string);
  if (!stems.length) stems.push("master");

  try {
    const result = await searchDpmaRegister(stems);
    return result;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function runScheduledScan(scanId: string, scanType: "web" | "dpma" | "all"): Promise<void> {
  const db = getSupabaseAdminClient();

  await db.from("scheduled_scans").update({
    status: "running",
    started_at: new Date().toISOString(),
  }).eq("id", scanId);

  const result: Record<string, unknown> = {};

  try {
    if (scanType === "web" || scanType === "all") {
      console.log("[Scheduler] Running web deep scan...");
      result.web = await runWebDeepScan();
    }

    if (scanType === "dpma" || scanType === "all") {
      console.log("[Scheduler] Running DPMA scan...");
      result.dpma = await runDpmaScan();
    }

    // E-Mail-Report senden
    try {
      result.email = await sendScanReport();
    } catch (e) {
      result.emailError = (e as Error).message;
    }

    await db.from("scheduled_scans").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      result,
    }).eq("id", scanId);
  } catch (e) {
    await db.from("scheduled_scans").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      result: { ...result, error: (e as Error).message },
    }).eq("id", scanId);
  }
}
