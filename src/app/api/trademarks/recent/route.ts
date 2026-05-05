import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  if (!since) return NextResponse.json({ error: "since param required" }, { status: 400 });

  const db = getSupabaseAdminClient();
  const { data } = await db
    .from("trademarks")
    .select("id, markenname, aktenzeichen, relevance_score, match_type, resolved_website, created_at, quelle, prioritaet")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ trademarks: data ?? [] });
}
