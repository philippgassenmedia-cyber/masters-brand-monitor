import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const PatchSchema = z.object({
  active: z.boolean().optional(),
  title: z.string().min(1).max(500).optional(),
  company_name: z.string().max(300).nullable().optional(),
  url: z.string().url().nullable().optional().or(z.literal("")),
  category: z.enum(["clear_violation", "suspected_violation", "borderline", "generic_use", "own_brand", "other_industry", "false_positive"]).optional(),
  score: z.number().int().min(1).max(10).optional(),
  reasoning: z.string().max(5000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

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
    .from("reference_cases")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/reference-cases");
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();
  const { error } = await db.from("reference_cases").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/reference-cases");
  return NextResponse.json({ ok: true });
}
