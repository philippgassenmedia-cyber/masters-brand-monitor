import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { sendScanReport } from "@/lib/email-service";
import { searchWeb, type SearchRegion } from "@/lib/search";
import { analyzeHitWithGemini } from "@/lib/gemini";
import { scrapeImpressum } from "@/lib/impressum-scraper";
import { loadExcludedDomains, isExcluded, hostOf, BRAND_NAME } from "@/lib/brand";

function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret");
  return header === secret;
}

const DEEP_QUERIES = [
  // Immobilien
  `"${BRAND_NAME}" Immobilien Makler`,
  `"${BRAND_NAME}" Hausverwaltung`,
  `"${BRAND_NAME}" Immobilien GmbH`,
  `"${BRAND_NAME}" Immobilien Projektentwicklung`,
  `"${BRAND_NAME}" Property Management`,
  `"${BRAND_NAME}" Real Estate`,
  `"${BRAND_NAME}" Bauträger`,
  `"${BRAND_NAME}" Immobilien Vermietung`,
  `"${BRAND_NAME}" Immobilien Verwaltung`,
  // Unternehmensberatung
  `"${BRAND_NAME}" Unternehmensberatung`,
  `"${BRAND_NAME}" Beratung GmbH`,
  `"${BRAND_NAME}" Consulting`,
  `"${BRAND_NAME}" Management Beratung`,
  `"${BRAND_NAME}" Business Consulting`,
  // Überschneidungsfelder
  `"${BRAND_NAME}" Immobilienberatung`,
  `"${BRAND_NAME}" Investment`,
  `"${BRAND_NAME}" Facility Management`,
  `"${BRAND_NAME}" Vermögensverwaltung`,
  `"${BRAND_NAME}" Finanzberatung`,
  // Städte
  `"${BRAND_NAME}" Immobilien Berlin`,
  `"${BRAND_NAME}" Immobilien München`,
  `"${BRAND_NAME}" Immobilien Hamburg`,
  `"${BRAND_NAME}" Immobilien Frankfurt`,
  `"${BRAND_NAME}" Immobilien Köln`,
  `"${BRAND_NAME}" Immobilien Stuttgart`,
  `"${BRAND_NAME}" Beratung Berlin`,
  `"${BRAND_NAME}" Beratung München`,
];

async function runDeepScan(): Promise<{
  queries: number;
  rawResults: number;
  newHits: number;
  updatedHits: number;
  errors: number;
}> {
  const db = getSupabaseAdminClient();
  const excluded = await loadExcludedDomains();
  const region: SearchRegion = "deutschland";

  let queries = 0;
  let rawResults = 0;
  let newHits = 0;
  let updatedHits = 0;
  let errors = 0;

  // Create scan run
  const { data: run } = await db
    .from("scan_runs")
    .insert({
      region,
      triggered_by: "cron",
      status: "running",
    })
    .select("id")
    .single();

  const runId = run?.id;

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    for (const query of DEEP_QUERIES) {
      try {
        queries++;
        // Rate-Limit: max 15 RPM → 4s zwischen Calls
        if (queries > 1) await delay(4000);
        let results;
        try {
          results = await searchWeb(query, region);
        } catch (retryErr) {
          // Retry nach 10s bei Rate-Limit
          if ((retryErr as Error).message.includes("429") || (retryErr as Error).message.includes("quota")) {
            console.log("[Cron] Rate limit hit, waiting 15s...");
            await delay(15000);
            results = await searchWeb(query, region);
          } else {
            throw retryErr;
          }
        }
        rawResults += results.length;

        for (const result of results) {
          try {
            const host = hostOf(result.url);
            if (!host || isExcluded(result.url, excluded)) continue;

            // Check if hit already exists
            const { data: existing } = await db
              .from("hits")
              .select("id")
              .eq("url", result.url)
              .maybeSingle();

            if (existing) {
              await db
                .from("hits")
                .update({ last_seen_at: new Date().toISOString() })
                .eq("id", existing.id);
              updatedHits++;
              continue;
            }

            // Scrape impressum
            const profile = await scrapeImpressum(result.url).catch(() => null);

            // Analyze with Gemini
            const analysis = await analyzeHitWithGemini({
              raw: { url: result.url, title: result.title, snippet: result.snippet },
              profile,
            });

            // Insert new hit
            await db.from("hits").insert({
              url: result.url,
              domain: host,
              title: result.title,
              snippet: result.snippet,
              ai_score: analysis.score,
              ai_reasoning: analysis.reasoning,
              ai_recommendation: analysis.recommendation,
              ai_violation_category: analysis.violation_category,
              is_violation: analysis.is_violation,
              company_name: analysis.subject_company ?? profile?.company_name,
              address: analysis.subject_company_address ?? profile?.address,
              email: profile?.email,
              phone: profile?.phone,
              status: "new",
              scan_run_id: runId,
            });
            newHits++;
          } catch {
            errors++;
          }
        }
      } catch (e) {
        errors++;
        // Budget exceeded — stop scanning
        if ((e as Error).name === "SearchBudgetExceededError") break;
      }
    }

    // Update scan run
    if (runId) {
      await db
        .from("scan_runs")
        .update({
          finished_at: new Date().toISOString(),
          queries_run: queries,
          raw_results: rawResults,
          new_hits: newHits,
          updated_hits: updatedHits,
          status: errors > 0 ? "partial" : "success",
        })
        .eq("id", runId);
    }
  } catch (e) {
    if (runId) {
      await db
        .from("scan_runs")
        .update({
          finished_at: new Date().toISOString(),
          queries_run: queries,
          raw_results: rawResults,
          new_hits: newHits,
          updated_hits: updatedHits,
          status: "failed",
        })
        .eq("id", runId);
    }
    throw e;
  }

  return { queries, rawResults, newHits, updatedHits, errors };
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDeepScan();
    let emailResult = { sent: 0, violations: 0 };
    try { emailResult = await sendScanReport(); } catch (e) { console.error("[Cron] Email:", (e as Error).message); }
    return NextResponse.json({ ok: true, ...summary, email: emailResult });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDeepScan();
    let emailResult = { sent: 0, violations: 0 };
    try { emailResult = await sendScanReport(); } catch (e) { console.error("[Cron] Email:", (e as Error).message); }
    return NextResponse.json({ ok: true, ...summary, email: emailResult });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
