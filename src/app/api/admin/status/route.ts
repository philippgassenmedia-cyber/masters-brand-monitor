import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { verifyAdminPassword } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const password = req.headers.get("x-admin-password") ?? "";
  if (!await verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getSupabaseAdminClient();

  // API key overrides from DB
  const { data: overridesRow } = await db
    .from("settings").select("value").eq("key", "api_key_overrides").maybeSingle();
  const overrides = (overridesRow?.value ?? {}) as Record<string, string>;

  const keys = {
    GEMINI_API_KEY: overrides.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "",
    SUPABASE_URL: overrides.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: overrides.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
  const keyOverrides = {
    GEMINI_API_KEY: !!overrides.GEMINI_API_KEY,
    SUPABASE_URL: !!overrides.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!overrides.SUPABASE_SERVICE_ROLE_KEY,
  };

  // Gemini health check
  let geminiStatus: "online" | "error" | "unknown" = "unknown";
  let geminiLatency = 0;
  let geminiError = "";
  try {
    const t = Date.now();
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${keys.GEMINI_API_KEY}`,
      { signal: AbortSignal.timeout(6000) }
    );
    geminiLatency = Date.now() - t;
    if (r.ok) {
      geminiStatus = "online";
    } else {
      const err = await r.json().catch(() => ({}));
      geminiError = `HTTP ${r.status}: ${(err as { error?: { message?: string } }).error?.message ?? r.statusText}`;
      geminiStatus = "error";
    }
  } catch (e) {
    geminiStatus = "error";
    geminiError = (e as Error).message;
  }

  // Supabase health
  const sbT = Date.now();
  const { error: sbError } = await db.from("settings").select("id").limit(1);
  const supabaseLatency = Date.now() - sbT;

  // Usage — last 30 days by provider
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: usageRows } = await db
    .from("api_usage")
    .select("provider, count")
    .gte("day", since);

  const usageByProvider: Record<string, number> = {};
  for (const row of usageRows ?? []) {
    usageByProvider[row.provider as string] =
      (usageByProvider[row.provider as string] ?? 0) + Number(row.count);
  }

  // Usage — last 7 days
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: usage7Rows } = await db
    .from("api_usage")
    .select("provider, count")
    .gte("day", since7);

  const usage7ByProvider: Record<string, number> = {};
  for (const row of usage7Rows ?? []) {
    usage7ByProvider[row.provider as string] =
      (usage7ByProvider[row.provider as string] ?? 0) + Number(row.count);
  }

  return NextResponse.json({
    keys,
    keyOverrides,
    status: {
      gemini: { status: geminiStatus, latency: geminiLatency, error: geminiError },
      supabase: { status: sbError ? "error" : "online", latency: supabaseLatency, error: sbError?.message ?? "" },
    },
    usage30d: usageByProvider,
    usage7d: usage7ByProvider,
  });
}
