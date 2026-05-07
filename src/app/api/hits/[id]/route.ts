import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["new", "reviewing", "confirmed", "dismissed", "sent_to_lawyer", "resolved"]).optional(),
  notes: z.string().max(5000).optional(),
});

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();
  const { error } = await db.from("hits").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/");
  revalidatePath("/hits");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });

  const db = getSupabaseAdminClient();
  const { error } = await db
    .from("hits")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
