import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("settings")
    .select("key, value");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings: Record<string, unknown> = {};
  for (const row of rows ?? []) {
    try {
      settings[row.key as string] =
        typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    } catch {
      settings[row.key as string] = row.value;
    }
  }

  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // Upsert each key-value pair
  const entries = Object.entries(body as Record<string, unknown>);
  const upserts = entries.map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
    updated_at: new Date().toISOString(),
  }));

  if (upserts.length > 0) {
    const { error } = await admin
      .from("settings")
      .upsert(upserts, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
