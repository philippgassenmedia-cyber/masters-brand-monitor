import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  company_name: z.string().max(300).optional().nullable(),
  url: z.string().url().optional().nullable().or(z.literal("")),
  category: z.enum(["clear_violation", "suspected_violation", "borderline", "generic_use", "own_brand", "other_industry", "false_positive"]),
  score: z.number().int().min(1).max(10),
  reasoning: z.string().max(5000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional().default(true),
});

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("reference_cases")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe", details: parsed.error.flatten() }, { status: 400 });

  const { url, ...rest } = parsed.data;
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("reference_cases")
    .insert({ ...rest, url: url || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/reference-cases");
  return NextResponse.json(data, { status: 201 });
}
