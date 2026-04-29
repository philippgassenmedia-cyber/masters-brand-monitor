import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json();
  if (!password || typeof password !== "string") {
    return NextResponse.json({ ok: false, error: "Passwort erforderlich" });
  }

  const db = getSupabaseAdminClient();
  const { data } = await db
    .from("settings")
    .select("value")
    .eq("key", "admin_console")
    .maybeSingle();

  if (!data) {
    // First-time setup — the first password entered becomes the admin password
    const salt = randomBytes(16).toString("hex");
    const hash = createHash("sha256").update(salt + password).digest("hex");
    await db.from("settings").insert({
      key: "admin_console",
      value: { password_hash: hash, salt, created_at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, setup: true });
  }

  const { password_hash, salt } = data.value as { password_hash: string; salt: string };
  const hash = createHash("sha256").update(salt + password).digest("hex");
  if (hash !== password_hash) {
    return NextResponse.json({ ok: false, error: "Falsches Passwort" });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: "Ungültige Eingabe" });
  }

  const db = getSupabaseAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "admin_console").maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "Noch nicht eingerichtet" });

  const { password_hash, salt } = data.value as { password_hash: string; salt: string };
  const currentHash = createHash("sha256").update(salt + currentPassword).digest("hex");
  if (currentHash !== password_hash) {
    return NextResponse.json({ ok: false, error: "Aktuelles Passwort falsch" });
  }

  const newSalt = randomBytes(16).toString("hex");
  const newHash = createHash("sha256").update(newSalt + newPassword).digest("hex");
  await db.from("settings").update({
    value: { password_hash: newHash, salt: newSalt, updated_at: new Date().toISOString() },
  }).eq("key", "admin_console");

  return NextResponse.json({ ok: true });
}
