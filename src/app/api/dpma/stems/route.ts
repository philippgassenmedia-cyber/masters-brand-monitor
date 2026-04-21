import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.from("brand_stems").select("*").order("created_at");
  return NextResponse.json({ stems: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { stamm } = z.object({ stamm: z.string().min(1) }).parse(await req.json());
  const { error } = await supabase.from("brand_stems").upsert({ stamm: stamm.toLowerCase().trim(), aktiv: true }, { onConflict: "stamm" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = (await req.json()) as { id: string };
  await supabase.from("brand_stems").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
