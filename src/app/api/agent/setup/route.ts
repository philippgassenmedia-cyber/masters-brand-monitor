import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Gibt die Konfiguration für den lokalen DPMA-Agent zurück.
 * Nur für eingeloggte Benutzer — enthält sensible Keys.
 */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  };

  // Prüfen ob alle Keys vorhanden
  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Server-Konfiguration unvollständig: ${missing.join(", ")}` }, { status: 500 });
  }

  return NextResponse.json({ config });
}
