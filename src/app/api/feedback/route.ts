import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const FeedbackSchema = z.object({
  item_type: z.enum(["hit", "trademark"]),
  item_id: z.string().uuid(),
  rating: z.enum(["correct", "too_high", "too_low", "false_positive", "missed"]),
  correct_score: z.number().int().min(0).max(10).nullable().optional(),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const { error } = await supabase.from("hit_feedback").insert({
    ...parsed.data,
    created_by: auth.user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const itemType = url.searchParams.get("item_type");
  const itemId = url.searchParams.get("item_id");

  let query = supabase.from("hit_feedback").select("*").order("created_at", { ascending: false });
  if (itemType) query = query.eq("item_type", itemType);
  if (itemId) query = query.eq("item_id", itemId);

  const { data } = await query.limit(100);
  return NextResponse.json({ feedback: data ?? [] });
}
