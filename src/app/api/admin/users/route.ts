import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();

  // Fetch all auth users
  const { data: { users }, error: usersErr } = await db.auth.admin.listUsers();
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

  // Fetch all profiles for role data
  const { data: profiles } = await db.from("profiles").select("id, role, approved, display_name");
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const result = (users ?? []).map((u) => {
    const p = profileMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      display_name: p?.display_name ?? null,
      role: (p?.role as string) ?? "lawyer",
      approved: p?.approved ?? false,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    };
  });

  return NextResponse.json({ users: result });
}

export async function PATCH(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = z.object({
    userId: z.string().uuid(),
    role: z.enum(["lawyer", "viewer"]),
  }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });

  const db = getSupabaseAdminClient();
  const { error } = await db
    .from("profiles")
    .update({ role: parsed.data.role, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
