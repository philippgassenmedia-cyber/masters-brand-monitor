import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { searchDpmaRegister } from "@/lib/dpma/register-search";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Aktive Stämme laden
  const admin = getSupabaseAdminClient();
  const { data: stemsData } = await admin
    .from("brand_stems")
    .select("stamm")
    .eq("aktiv", true);
  const stems = (stemsData ?? []).map((s) => s.stamm as string);
  if (!stems.length) stems.push("master");

  try {
    const result = await searchDpmaRegister(stems);
    console.log("[DPMA-Search]", JSON.stringify(result));
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[DPMA-Search] Fatal:", (e as Error).message, (e as Error).stack);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
