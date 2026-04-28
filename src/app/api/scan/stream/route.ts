import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { searchWeb, SearchBudgetExceededError, type SearchRegion } from "@/lib/search";
import { analyzeHitWithGemini } from "@/lib/gemini";
import { scrapeImpressum } from "@/lib/impressum-scraper";
import { loadExcludedDomains, isExcluded, hostOf, BRAND_NAME } from "@/lib/brand";

interface ScanParams {
  region: SearchRegion;
  mode: "quick" | "deep";
  freeText?: string;
}

// Cities for geo-tagged queries
const CITIES_BY_REGION: Record<string, string[]> = {
  hessen: [
    "Frankfurt", "Wiesbaden", "Kassel", "Darmstadt", "Offenbach", "Gießen", "Marburg",
    "Fulda", "Hanau", "Bad Homburg",
  ],
  deutschland: [
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart", "Düsseldorf",
    "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden", "Hannover", "Nürnberg",
    "Kassel", "Wiesbaden",
  ],
  dach: [
    "Berlin", "Hamburg", "München", "Frankfurt", "Wien", "Zürich", "Salzburg",
    "Graz", "Basel", "Bern",
  ],
  eu: [
    "Berlin", "München", "Frankfurt", "Wien", "Zürich", "Amsterdam", "Paris",
    "Brüssel", "Luxemburg", "Mailand",
  ],
  welt: [
    "Berlin", "München", "Frankfurt", "London", "New York", "Dubai",
    "Wien", "Zürich",
  ],
};

function buildQueries(params: ScanParams): Array<{ query: string; city?: string }> {
  const queries: Array<{ query: string; city?: string }> = [];
  const brand = BRAND_NAME;
  const cities = CITIES_BY_REGION[params.region] ?? CITIES_BY_REGION.deutschland;

  if (params.freeText) {
    queries.push({ query: params.freeText });
  }

  // ── Immobilien (Primär-Fokus, Quick + Deep) ───────────────────────────────
  queries.push({ query: `"${brand}" Immobilien` });
  queries.push({ query: `"${brand}" Immobilien Makler` });
  queries.push({ query: `"${brand}" Immobilien GmbH` });
  queries.push({ query: `"${brand}" Hausverwaltung` });
  queries.push({ query: `"${brand}" Immobilienvermittlung` });
  queries.push({ query: `"${brand}" Immobilien Projektentwicklung` });
  queries.push({ query: `"${brand}" Bauträger` });
  queries.push({ query: `"${brand}" Real Estate` });
  queries.push({ query: `"${brand}" Property Management` });
  queries.push({ query: `"${brand}" Wohnungsvermittlung` });
  queries.push({ query: `"${brand}" Gewerbeimmobilien` });
  queries.push({ query: `"${brand}" Immobilien Verwaltung` });
  queries.push({ query: `"${brand}" Mietverwaltung` });
  queries.push({ query: `"${brand}" Immobilienberatung` });
  queries.push({ query: `"${brand}" Immobiliengesellschaft` });

  // ── Beratung / Consulting (Sekundär — nur Quick: Unternehmensberatung) ────
  queries.push({ query: `"${brand}" Unternehmensberatung` });

  if (params.mode === "deep") {
    // Weitere Immobilien-Queries
    queries.push({ query: `"${brand}" Wohnimmobilien` });
    queries.push({ query: `"${brand}" Neubau Immobilien` });
    queries.push({ query: `"${brand}" Gewerbemakler` });
    queries.push({ query: `"${brand}" Immobilien Vermietung` });
    queries.push({ query: `"${brand}" Investment Immobilien` });
    queries.push({ query: `"${brand}" Immobilien Verwaltung GmbH` });
    queries.push({ query: `"${brand}" Facility Management` });
    // Consulting nur im Deep-Modus
    queries.push({ query: `"${brand}" Consulting` });
    queries.push({ query: `"${brand}" Beratung GmbH` });
    queries.push({ query: `"${brand}" Vermögensverwaltung` });
  }

  // ── Städte-Queries (Immobilien-Fokus) ─────────────────────────────────────
  for (const city of cities) {
    queries.push({ query: `"${brand}" Immobilien ${city}`, city });
    queries.push({ query: `"${brand}" Makler ${city}`, city });
    if (params.mode === "deep") {
      queries.push({ query: `"${brand}" Hausverwaltung ${city}`, city });
      queries.push({ query: `"${brand}" Immobiliengesellschaft ${city}`, city });
    }
  }

  return queries;
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const region: SearchRegion = body.region ?? "deutschland";
  const mode: "quick" | "deep" = body.mode ?? "quick";
  const freeText: string | undefined = body.freeText;

  const queries = buildQueries({ region, mode, freeText });
  const db = getSupabaseAdminClient();
  const excluded = await loadExcludedDomains();

  // Create scan run
  const { data: run } = await db
    .from("scan_runs")
    .insert({
      region,
      triggered_by: auth.user.email ?? "user",
      status: "running",
    })
    .select("id")
    .single();
  const runId = run?.id;

  let newHits = 0;
  let updatedHits = 0;
  let errorCount = 0;
  let queriesRun = 0;
  let rawResults = 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 2KB padding for SSE buffering
      controller.enqueue(encoder.encode(":".padEnd(2048, " ") + "\n\n"));

      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller closed
        }
      };

      // Keepalive every 2s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 2000);

      try {
        send({ type: "status", message: `Starte Scan: ${queries.length} Abfragen, Region ${region}, Modus ${mode}` });

        // Inkrementell scan_runs aktualisieren — so bleiben Zwischenergebnisse erhalten
        const flushRunStats = async (status?: string) => {
          if (!runId) return;
          await db.from("scan_runs").update({
            queries_run: queriesRun,
            raw_results: rawResults,
            new_hits: newHits,
            updated_hits: updatedHits,
            ...(status ? { finished_at: new Date().toISOString(), status } : {}),
          }).eq("id", runId);
        };

        for (let i = 0; i < queries.length; i++) {
          const q = queries[i];
          send({
            type: "query:start",
            index: i + 1,
            total: queries.length,
            query: q.query,
            city: q.city,
          });

          try {
            queriesRun++;
            // Rate-Limit Schutz: Quick 2s, Deep 4s zwischen Gemini Calls
            const delay = mode === "quick" ? 2000 : 4000;
            if (i > 0) await new Promise((r) => setTimeout(r, delay));
            const results = await searchWeb(q.query, region);
            rawResults += results.length;
            send({ type: "query:done", resultCount: results.length, city: q.city });

            for (const result of results) {
              try {
                const host = hostOf(result.url);
                if (!host || isExcluded(result.url, excluded)) continue;

                // Check if already exists
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
                  send({ type: "hit:update", url: result.url });
                  continue;
                }

                // Scrape impressum
                const profile = await scrapeImpressum(result.url).catch(() => null);

                // Analyze — Fehler nicht fatal: Hit wird auch ohne KI-Daten gespeichert
                let analysis: Awaited<ReturnType<typeof analyzeHitWithGemini>> | null = null;
                try {
                  analysis = await analyzeHitWithGemini({
                    raw: { url: result.url, title: result.title, snippet: result.snippet },
                    profile,
                  });
                } catch (e) {
                  errorCount++;
                  send({ type: "error", message: `KI-Analyse fehlgeschlagen für ${host}: ${(e as Error).message.slice(0, 120)}` });
                }

                // Insert — sofort gespeichert, unabhängig vom weiteren Scan-Verlauf
                const { data: inserted, error: insertError } = await db
                  .from("hits")
                  .insert({
                    url: result.url,
                    domain: host,
                    title: result.title,
                    snippet: result.snippet,
                    ai_score: analysis?.score ?? null,
                    ai_reasoning: analysis?.reasoning ?? null,
                    ai_recommendation: analysis?.recommendation ?? null,
                    violation_category: analysis?.violation_category ?? null,
                    ai_is_violation: analysis?.is_violation ?? null,
                    company_name: analysis?.subject_company ?? profile?.company_name ?? null,
                    address: analysis?.subject_company_address ?? profile?.address ?? null,
                    email: profile?.email ?? null,
                    phone: profile?.phone ?? null,
                    social_links: profile?.social_links ?? null,
                    impressum_raw: profile?.raw ?? null,
                    status: "new",
                  })
                  .select("id")
                  .single();

                if (insertError) {
                  errorCount++;
                  send({ type: "error", message: `DB-Insert fehlgeschlagen für ${host}: ${insertError.message.slice(0, 120)}` });
                  continue;
                }

                newHits++;
                send({
                  type: "hit:new",
                  id: inserted?.id,
                  domain: host,
                  url: result.url,
                  score: analysis?.score ?? null,
                  company: analysis?.subject_company ?? profile?.company_name ?? null,
                  city: q.city,
                });
              } catch (e) {
                errorCount++;
                send({ type: "error", message: `Fehler bei ${result.url?.slice(0, 60)}: ${(e as Error).message?.slice(0, 100)}` });
              }
            }
          } catch (e) {
            errorCount++;
            if (e instanceof SearchBudgetExceededError) {
              send({ type: "error", message: e.message });
              await flushRunStats("partial");
              break;
            }
            send({ type: "error", message: (e as Error).message?.slice(0, 200) ?? "Unbekannter Fehler" });
          }

          // Stats nach jeder Query persistieren — Zwischenergebnisse überleben einen Abbruch
          await flushRunStats();
        }

        // Abschluss
        await flushRunStats(errorCount > 0 ? "partial" : "success");
        if (runId) {
          await db.from("scan_runs").update({ finished_at: new Date().toISOString() }).eq("id", runId);
        }

        send({
          type: "done",
          newHits,
          updated: updatedHits,
          errors: errorCount,
          queries: queriesRun,
          rawResults,
        });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
        if (runId) {
          await db
            .from("scan_runs")
            .update({
              finished_at: new Date().toISOString(),
              queries_run: queriesRun,
              raw_results: rawResults,
              new_hits: newHits,
              updated_hits: updatedHits,
              status: "failed",
            })
            .eq("id", runId);
        }
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
