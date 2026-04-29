import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { verifyAdminPassword } from "@/lib/admin-auth";

const ALLOWED_KEYS = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export async function PUT(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const password = req.headers.get("x-admin-password") ?? "";
  if (!await verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { key, value } = await req.json() as { key: string; value: string };
  if (!ALLOWED_KEYS.includes(key as typeof ALLOWED_KEYS[number])) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const { data: existing } = await db
    .from("settings").select("value").eq("key", "api_key_overrides").maybeSingle();
  const overrides = { ...(existing?.value ?? {}) } as Record<string, string>;

  if (!value || value.trim() === "") {
    delete overrides[key];
  } else {
    overrides[key] = value.trim();
  }

  await db.from("settings").upsert(
    { key: "api_key_overrides", value: overrides },
    { onConflict: "key" }
  );

  return NextResponse.json({ ok: true });
}
