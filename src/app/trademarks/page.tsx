import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { TrademarksClient } from "./trademarks-client";

export const dynamic = "force-dynamic";

export default async function TrademarksPage({
  searchParams,
}: {
  searchParams: Promise<{
    matchType?: string;
    priority?: string;
    minScore?: string;
  }>;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const params = await searchParams;
  const showAll = params.matchType === "all";
  const minScore = Number(params.minScore ?? 0);

  // Build query
  let query = supabase
    .from("trademarks")
    .select("*")
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (!showAll) {
    // Default: only workflow_status = 'new'
    if (!params.matchType && !params.priority && !params.minScore) {
      query = query.eq("workflow_status", "new");
    }
  }

  if (params.matchType && params.matchType !== "all") {
    query = query.eq("match_type", params.matchType);
  }
  if (params.priority) {
    query = query.eq("prioritaet", params.priority);
  }
  if (minScore > 0) {
    query = query.gte("relevance_score", minScore);
  }

  // Fetch all for KPIs
  const [filteredRes, allRes] = await Promise.all([
    query,
    supabase
      .from("trademarks")
      .select("id, match_type, prioritaet, relevance_score, widerspruchsfrist_ende"),
  ]);

  const trademarks = filteredRes.data ?? [];
  const all = allRes.data ?? [];

  // Compute KPIs
  const total = all.length;
  const exact = all.filter((t) => t.match_type === "exact").length;
  const compound = all.filter((t) => t.match_type === "compound").length;
  const fuzzy = all.filter(
    (t) => t.match_type === "fuzzy" || t.match_type === "phonetic",
  ).length;
  const critical = all.filter(
    (t) => t.prioritaet === "critical" || t.prioritaet === "high",
  ).length;

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const fristSoon = all.filter((t) => {
    if (!t.widerspruchsfrist_ende) return false;
    const end = new Date(t.widerspruchsfrist_ende).getTime();
    return end > now && end - now < thirtyDaysMs;
  }).length;

  return (
    <AppShell user={auth.user}>
      <TrademarksClient
        trademarks={trademarks}
        kpis={{ total, exact, compound, fuzzy, critical, fristSoon }}
        filters={{
          matchType: params.matchType,
          priority: params.priority,
          minScore: params.minScore,
        }}
      />
    </AppShell>
  );
}
